import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { emitLog } from "../utils/sseManager.js"

export const getLogs = async (id, range = "all") => {
    if (!id) throw new CustomError("Election id is required", 400)

    let timeCondition = ""
    const values = [id]

    if (range !== "all") {
        const intervalMap = {
            "1h": "1 hour",
            "24h": "24 hours",
            "7d": "7 days"
        }

        timeCondition = "AND created_at >= NOW() - $2::interval"
        values.push(intervalMap[range])
    }

    const res = await pool.query(
        `SELECT id, level, message, created_at FROM logs WHERE election_id = $1 ${timeCondition} ORDER BY created_at ASC`,
        values
    )

    return res.rows
}

export const createLog = async (electionId, data, client = null) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!data?.level) throw new CustomError("Log level is required", 400)
    if (!data?.message) throw new CustomError("Log message is required", 400)

    const executor = client ?? pool

    const electionRes = await executor.query(
        "SELECT 1 FROM elections WHERE id = $1 LIMIT 1",
        [electionId]
    )

    if (electionRes.rowCount === 0)
        throw new CustomError("No election found with the given id", 404)

    const logRes = await executor.query(
        "INSERT INTO logs (election_id, level, message) VALUES ($1, $2, $3) RETURNING *",
        [electionId, data?.level, data?.message]
    )

    try {
        emitLog(electionId, logRes.rows[0])
    } catch (err) {
        console.log(err)
    }

    return logRes.rows[0]
}
