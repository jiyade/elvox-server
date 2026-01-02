import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"

export const getReults = async (electionId, queries) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

    const { status, year, class: classId } = queries

    // BUILD DYNAMIC SQL QUERY
    const values = [electionId]
    let idx = 2

    let query = `
        SELECT
            r.total_votes,
            r.result_status,
            c.id AS candidate_id,
            c.name,
            c.category,
            c.class,
            c.class_id,
            c.semester
        FROM results r
        JOIN candidates c ON c.id = r.candidate_id
        WHERE r.election_id = $1
          AND r.published = true
    `

    // OPTIONAL RESULT STATUS FILTER (won / lost/ tie)
    if (status && status !== "all") {
        query += ` AND r.result_status = $${idx++}`
        values.push(status)
    }

    // OPTIONAL CLASS FILTER
    if (classId && classId !== "all") {
        query += ` AND c.class_id = $${idx++}`
        values.push(classId)
    }

    // OPTIONAL YEAR FILTER (MAPPED TO SEMESTERS)
    if (year && year !== "all") {
        const yearMap = {
            first: [1, 2],
            second: [3, 4],
            third: [5, 6],
            fourth: [7, 8]
        }

        query += ` AND c.semester = ANY($${idx++})`
        values.push(yearMap[year])
    }

    query += ` ORDER BY c.class_id, c.semester, r.total_votes DESC`

    const { rows } = await pool.query(query, values)

    // GROUP ROWS
    const grouped = {}

    rows.forEach((r) => {
        const key = `${r.class_id}-${r.semester}`

        if (!grouped[key]) {
            grouped[key] = {
                classId: r.class_id,
                class: r.class,
                semester: r.semester,
                totalVotes: 0,
                candidates: []
            }
        }

        grouped[key].candidates.push({
            id: r.candidate_id,
            name: r.name,
            category: r.category,
            votes: r.total_votes,
            status: r.result_status.toUpperCase(),
            lead: null
        })

        grouped[key].totalVotes += r.total_votes
    })

    // SORT CANDIDATES AND COMPUTE LEAD
    Object.values(grouped).forEach((group) => {
        group.candidates.sort((a, b) => b.votes - a.votes)

        const topVotes = group.candidates[0]?.votes ?? 0
        const secondVotes = group.candidates[1]?.votes ?? topVotes

        group.candidates.forEach((c, index) => {
            let lead = 0
            if (c.votes === topVotes && index === 0) {
                // winner
                lead = topVotes - secondVotes
            } else {
                // everyone else
                lead = c.votes - topVotes
            }
            c.lead = lead.toString()
        })
    })

    return Object.values(grouped)
}
