import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"

export const getReults = async (electionId, queries) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

    const { status, year, class: className } = queries

    // BUILD DYNAMIC SQL QUERY
    const values = [electionId]
    let idx = 2

    let query = `
        SELECT
            r.total_votes,
            r.result_status,
            r.category,
            r.is_nota,
            r.class_id,
            r.rank,
            c.id AS candidate_id,
            c.name,
            cl.name AS class,
            cl.year
        FROM results r
        LEFT JOIN candidates c ON c.id = r.candidate_id
        JOIN classes cl ON cl.id = r.class_id
        JOIN elections e ON e.id = r.election_id
        WHERE r.election_id = $1
            AND e.result_published = TRUE
    `

    // OPTIONAL RESULT STATUS FILTER (won / lost/ tie)
    if (status && status !== "all") {
        query += ` AND r.result_status = $${idx++}`
        values.push(status)
    }

    // OPTIONAL CLASS FILTER
    if (className && className !== "all") {
        query += ` AND LOWER(cl.name) = LOWER($${idx++})`
        values.push(className)
    }

    // OPTIONAL YEAR FILTER (MAPPED TO SEMESTERS)
    if (year && year !== "all") {
        const yearMap = {
            first: 1,
            second: 2,
            third: 3,
            fourth: 4
        }

        query += ` AND cl.year = $${idx++}`
        values.push(yearMap[year])
    }

    query += ` ORDER BY r.class_id, cl.year, r.rank ASC`

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
