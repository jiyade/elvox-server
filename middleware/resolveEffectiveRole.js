import pool from "../db/db.js"

const resolveEffectiveRole = async (req, res, next) => {
    if (!req.user) return next()

    req.user.effectiveRole = req.user.role

    if (req.user.role !== "teacher") return next()

    const activeElection = await pool.query(
        `
        SELECT id FROM elections
        WHERE status IN ('draft', 'nominations', 'pre-voting', 'voting')
        LIMIT 1      
    `
    )

    if (activeElection.rowCount === 0) return next()

    const electionId = activeElection.rows[0].id

    const supervisorRes = await pool.query(
        `
        SELECT 1
        FROM supervisors
        WHERE election_id = $1 AND user_id = $2
        `,
        [electionId, req.user.id]
    )

    if (supervisorRes.rowCount > 0) {
        req.user.effectiveRole = "supervisor"
    }

    next()
}

export default resolveEffectiveRole
