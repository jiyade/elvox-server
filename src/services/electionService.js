import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const getElections = async () => {
    const res = await pool.query(
        "SELECT * FROM elections WHERE status != 'closed' ORDER BY election_start DESC"
    )

    if (res.rowCount === 0)
        throw new CustomError("No active election found", 404)

    return res.rows
}

export const getElection = async (id) => {
    const res = await pool.query("SELECT * FROM elections WHERE id = $1", [id])

    if (res.rowCount === 0) throw new CustomError("No election found", 404)

    return res.rows[0]
}
