const buildGetResultsQuery = (electionId, queries, forExport = false) => {
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
            r.had_tie,
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

    if (forExport) {
        query += `
      ORDER BY
        r.class_id,
        cl.year,
        CASE
          WHEN r.category = 'general' THEN 1
          WHEN r.category = 'reserved' THEN 2
        END,
        r.rank ASC
    `
    } else {
        query += ` ORDER BY r.class_id, cl.year, r.rank ASC`
    }

    return { query, values }
}
export default buildGetResultsQuery
