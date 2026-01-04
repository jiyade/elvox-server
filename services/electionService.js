import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const getElections = async () => {
    const res = await pool.query(
        "SELECT * FROM elections WHERE status != 'closed' ORDER BY election_start DESC"
    )

    if (res.rowCount === 0)
        throw new CustomError("No active election found", 404)

    return res.rows[0]
}

export const getElection = async (id) => {
    const res = await pool.query("SELECT * FROM elections WHERE id = $1", [id])

    if (res.rowCount === 0) throw new CustomError("No election found", 404)

    return res.rows[0]
}

export const getAllElections = async () => {
    const res = await pool.query(
        "SELECT name, id, status FROM elections ORDER BY created_at DESC"
    )

    if (res.rowCount === 0) throw new CustomError("No election found", 404)

    return res.rows
}

export const getSupervisors = async () => {
    const res = await pool.query(
        "SELECT s.user_id, s.name, s.empcode, t.profile_pic, t.department FROM supervisors s JOIN teachers t ON s.user_id = t.user_id"
    )

    return res.rows
}

export const updateSupervisors = async (electionId, payload) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!payload?.add || !payload?.remove) {
        console.log("here", payload)
        throw new CustomError("Invalid payload", 400)
    }
    if (!Array.isArray(payload.add) || !Array.isArray(payload.remove))
        throw new CustomError("Invalid payload", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const { rows } = await client.query(
            "SELECT NOW() > voting_end AS voting_ended FROM elections WHERE id = $1 FOR UPDATE",
            [electionId]
        )

        if (rows.length === 0) throw new CustomError("No election found", 404)

        if (rows[0].voting_ended)
            throw new CustomError("Voting period has ended", 409)

        const removeIds = payload.remove.map((obj) => obj.id)
        const addIds = payload.add.map((obj) => obj.id)

        let addedCount = 0
        let removedCount = 0

        if (removeIds.length > 0) {
            const res = await client.query(
                `
                DELETE FROM supervisors
                WHERE election_id = $1
                AND user_id = ANY($2::uuid[])
                `,
                [electionId, removeIds]
            )

            removedCount = res.rowCount
        }

        if (addIds.length > 0) {
            const res = await client.query(
                `
                INSERT INTO supervisors (election_id, user_id, name, empcode)
                SELECT
                $1, t.user_id, t.name, t.empcode
                FROM teachers t
                WHERE t.user_id = ANY($2::uuid[])
                ON CONFLICT DO NOTHING
                `,
                [electionId, addIds]
            )

            addedCount = res.rowCount
        }

        await client.query("COMMIT")

        return {
            message: "Supervisors updated successfully",
            added: addedCount,
            removed: removedCount
        }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}
