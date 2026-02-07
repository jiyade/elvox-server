import CustomError from "../utils/CustomError.js"
import capitalize from "../utils/capitalize.js"
import escapeCsvValue from "../utils/escapeCsvValue.js"
import buildGetResultsQuery from "../utils/buildGetResultsQuery.js"
import pool from "../db/db.js"
import { createLog } from "./logService.js"
import { sendNotification } from "./notificationService.js"
import PDFDocument from "pdfkit"

export const getReults = async (electionId, queries) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

    const electionRes = await pool.query(
        "SELECT result_published FROM elections WHERE id = $1",
        [electionId]
    )

    if (electionRes.rowCount === 0)
        throw new CustomError("No election found", 404)

    if (!electionRes.rows[0].result_published)
        throw new CustomError("Result not published for this election", 403)

    const { query, values } = buildGetResultsQuery(electionId, queries)

    const { rows } = await pool.query(query, values)

    // GROUP ROWS
    const grouped = {}

    rows.forEach((r) => {
        const key = r.class_id

        if (!grouped[key]) {
            grouped[key] = {
                classId: r.class_id,
                class: r.class,
                year: r.year,
                results: {
                    general: {
                        totalVotes: 0,
                        candidates: []
                    },
                    reserved: {
                        totalVotes: 0,
                        candidates: []
                    }
                }
            }
        }

        grouped[key].results[r.category].candidates.push({
            id: r.candidate_id,
            name: r.is_nota ? "NOTA" : r.name,
            isNota: r.is_nota,
            votes: r.total_votes,
            status: r.result_status.toUpperCase(),
            rank: r.rank,
            lead: null,
            hadTie: r.had_tie
        })

        grouped[key].results[r.category].totalVotes += r.total_votes
    })

    // SORT CANDIDATES AND COMPUTE LEAD
    Object.values(grouped).forEach((group) => {
        ;["general", "reserved"].forEach((category) => {
            const arr = group.results[category].candidates

            if (!arr.length) return

            arr.sort((a, b) => a.rank - b.rank)

            const topVotes = arr[0].votes
            const secondVotes = arr[1]?.votes ?? topVotes

            arr.forEach((c, index) => {
                let lead = 0

                if (index === 0) {
                    lead = topVotes - secondVotes
                } else {
                    lead = c.votes - topVotes
                }

                c.lead = lead.toString()
            })
        })
    })

    return Object.values(grouped)
}

export const getRandomCandidatesResults = async (limit) => {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 10))

    const electionRes = await pool.query(
        "SELECT id, name FROM elections WHERE (status = 'post-voting' OR status = 'closed') AND result_published = TRUE ORDER BY election_end DESC LIMIT 1"
    )

    if (electionRes.rowCount === 0) return []

    const { id: electionId, name: electionName } = electionRes.rows[0]

    const query = `
        SELECT
            r.total_votes,
            r.result_status,
            r.category,
            c.id AS candidate_id,
            c.name,
            c.class,
            c.semester
        FROM results r
        JOIN candidates c ON c.id = r.candidate_id
        WHERE r.election_id = $1
          AND r.result_status != 'tie'
          AND r.is_nota = FALSE
        ORDER BY RANDOM()
        LIMIT $2
    `

    const res = await pool.query(query, [electionId, safeLimit])

    return {
        election: { id: electionId, name: electionName },
        results: res.rows
    }
}

export const publishResults = async (electionId, user) => {
    if (!electionId) throw new CustomError("Election id is required")

    const client = await pool.connect()

    let committed = false

    try {
        await client.query("BEGIN")

        const electionRes = await client.query(
            "SELECT status, name, auto_publish_results, result_published FROM elections WHERE id = $1 FOR UPDATE",
            [electionId]
        )

        if (electionRes.rowCount === 0)
            throw new CustomError("Invalid election id", 400)

        const {
            status,
            auto_publish_results: autoPublishResults,
            result_published: resultPublished
        } = electionRes.rows[0]

        if (resultPublished)
            throw new CustomError(
                "Results already published for this election",
                409
            )

        if (autoPublishResults)
            throw new CustomError(
                "Results cannot be published manually for this election",
                409
            )

        if (status !== "post-voting")
            throw new CustomError(
                "Results can only be published during post-voting state",
                409
            )

        await client.query(
            "UPDATE elections SET result_published = TRUE WHERE id = $1",
            [electionId]
        )

        await createLog(
            electionId,
            {
                level: "info",
                message: `Results published for election "${electionRes.rows[0].name}" by ${capitalize(user?.role)} ${user?.name} (id: ${user?.id})`
            },
            client
        )

        const userIdRes = await client.query("SELECT id FROM users")

        const userIds = userIdRes.rows.map((row) => row.id)

        await sendNotification(
            userIds,
            {
                message: `Results published for election "${electionRes.rows[0].name}"`,
                type: "info",
                title: "Results Published!"
            },
            client
        )

        await client.query("COMMIT")
        committed = true

        const tiedClassRes = await pool.query(
            "SELECT DISTINCT class_id FROM results WHERE election_id = $1 AND result_status = 'tie'",
            [electionId]
        )

        if (tiedClassRes.rowCount > 0) {
            const classIds = tiedClassRes.rows.map((r) => r.class_id)

            const tiedClassTutorRes = await pool.query(
                "SELECT user_id FROM teachers WHERE tutor_of = ANY($1)",
                [classIds]
            )

            if (tiedClassTutorRes.rowCount > 0) {
                const tutorIds = tiedClassTutorRes.rows.map((r) => r.user_id)

                await sendNotification(tutorIds, {
                    message: `Tie detected in your class. Please conduct a tie-breaker and submit the results`,
                    type: "info",
                    title: "Tie detected!"
                })
            }
        }

        return { ok: true, message: "Results published successfully" }
    } catch (err) {
        if (!committed) await client.query("ROLLBACK")

        throw err
    } finally {
        client.release()
    }
}

export const exportResults = async (electionId, queries, res) => {
    if (!electionId) throw new CustomError("Election id is required")

    const { format } = queries

    if (!format) throw new CustomError("Export format is required")

    const electionRes = await pool.query(
        "SELECT name, result_published FROM elections WHERE id = $1",
        [electionId]
    )

    if (electionRes.rowCount === 0)
        throw new CustomError("No election found", 404)

    if (!electionRes.rows[0].result_published)
        throw new CustomError("Result not published for this election", 403)

    const electionName = electionRes.rows[0].name

    const { query, values } = buildGetResultsQuery(electionId, queries, true)

    const { rows } = await pool.query(query, values)

    const fileName = electionName.replace(/[^a-z0-9]/gi, "_").toLowerCase()

    if (format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8")
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}_results.csv"`
        )

        // title
        res.write(`"${escapeCsvValue(electionName)} Results"\n\n`)

        // header row
        res.write("Name,Class,Year,Category,Votes,Rank,Status\n")

        if (!rows.length) {
            return res.end()
        }

        // data rows
        for (const r of rows) {
            const category =
                r.category.charAt(0).toUpperCase() + r.category.slice(1)

            const status = r.result_status.toUpperCase()

            const name = r.is_nota ? "NOTA" : r.name

            res.write(
                `"${escapeCsvValue(name)}","${escapeCsvValue(r.class)}",${r.year},"${escapeCsvValue(category)}",${r.total_votes},${r.rank},"${escapeCsvValue(status)}"\n`
            )
        }

        res.end()
        return
    } else if (format === "pdf") {
        const doc = new PDFDocument({ margin: 40, bufferPages: true })

        res.setHeader("Content-Type", "application/pdf")
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}_results.pdf"`
        )

        doc.pipe(res)

        const startX = 40
        let y = doc.y

        const rowHeight = 22
        const titleHeight = 28
        const columns = [
            { key: "name", label: "Name", width: 110, align: "left" },
            { key: "class", label: "Class", width: 130, align: "left" },
            { key: "year", label: "Year", width: 40, align: "center" },
            { key: "category", label: "Category", width: 70, align: "left" },
            { key: "votes", label: "Votes", width: 50, align: "center" },
            { key: "rank", label: "Rank", width: 40, align: "center" },
            { key: "status", label: "Status", width: 60, align: "center" }
        ]

        const tableWidth = columns.reduce((s, c) => s + c.width, 0)

        // title
        doc.rect(startX, y, tableWidth, titleHeight).stroke()
        doc.fontSize(14)
            .font("Helvetica-Bold")
            .text(`${electionName} Results`, startX, y + 9, {
                width: tableWidth,
                align: "center"
            })

        y += titleHeight

        // headers
        doc.fontSize(10).font("Helvetica-Bold")

        let x = startX
        for (const col of columns) {
            doc.rect(x, y, col.width, rowHeight).stroke()
            doc.text(col.label, x, y + 6, {
                width: col.width,
                align: "center"
            })
            x += col.width
        }

        y += rowHeight
        doc.font("Helvetica")

        // rows
        for (const r of rows) {
            const row = {
                name: r.is_nota ? "NOTA" : r.name,
                class: r.class,
                year: r.year,
                category:
                    r.category.charAt(0).toUpperCase() + r.category.slice(1),
                votes: r.total_votes,
                rank: r.rank,
                status: r.result_status.toUpperCase()
            }

            let x = startX
            for (const col of columns) {
                doc.rect(x, y, col.width, rowHeight).stroke()
                doc.text(String(row[col.key]), x + 4, y + 6, {
                    width: col.width - 8,
                    align: col.align
                })
                x += col.width
            }

            y += rowHeight

            // page break
            if (y > doc.page.height - 50) {
                doc.addPage()
                y = 40
            }
        }

        // footer
        const range = doc.bufferedPageRange()
        const totalPages = range.count

        for (let i = range.start; i < range.start + totalPages; i++) {
            doc.switchToPage(i)

            const { width, height, margins } = doc.page
            const footerY = height - margins.bottom + 10

            doc.fontSize(10).font("Helvetica")

            doc.text(`Page ${i + 1} of ${totalPages}`, margins.left, footerY, {
                lineBreak: false
            })

            const nameWidth = doc.widthOfString(electionName)
            const electionX = width - margins.right - nameWidth

            doc.text(electionName, electionX, footerY, {
                lineBreak: false
            })
        }

        doc.end()
        return
    } else {
        throw new CustomError("Invalid export format", 400)
    }
}
