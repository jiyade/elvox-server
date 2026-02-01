import CustomError from "../utils/CustomError.js"
import capitalize from "../utils/capitalize.js"
import buildGetResultsQuery from "../utils/buildGetResultsQuery.js"
import pool from "../db/db.js"
import { createLog } from "./logService.js"
import { sendNotification } from "./notificationService.js"

export const getReults = async (electionId, queries) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

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
            lead: null
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

        return { ok: true, message: "Results published successfully" }
    } catch (err) {
        await client.query("ROLLBACK")

        throw err
    } finally {
        client.release()
    }
}
