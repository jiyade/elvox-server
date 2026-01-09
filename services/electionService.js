import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { sendNotification } from "./notificationService.js"

export const getElections = async () => {
    const res = await pool.query(
        "SELECT * FROM elections WHERE status != 'closed' ORDER BY election_start DESC"
    )

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
        "SELECT s.user_id AS id, s.name, s.empcode, t.profile_pic, t.department FROM supervisors s JOIN teachers t ON s.user_id = t.user_id"
    )

    return res.rows
}

export const updateSupervisors = async (electionId, payload) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!payload?.add || !payload?.remove)
        throw new CustomError("Invalid payload", 400)

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

export const createElection = async (data) => {
    const {
        electionName,
        nominationStart,
        nominationEnd,
        votingStart,
        votingEnd,
        electionEnd
    } = data

    if (!electionName) throw new CustomError("Election name is required", 400)

    const parseTs = (v, name) => {
        const t = Date.parse(v)
        if (!v || Number.isNaN(t)) {
            throw new CustomError(`${name} is invalid or missing`, 400)
        }
        return t
    }

    const ns = parseTs(nominationStart, "Nomination start")
    const ne = parseTs(nominationEnd, "Nomination end")
    const vs = parseTs(votingStart, "Voting start")
    const ve = parseTs(votingEnd, "Voting end")
    const ee = parseTs(electionEnd, "Election end")

    if (ns <= Date.now())
        throw new CustomError("Nomination start must be in the future", 400)

    if (!(ns < ne))
        throw new CustomError(
            "Nomination end must be after nomination start",
            400
        )

    if (!(ne < vs))
        throw new CustomError("Voting must start after nominations end", 400)

    if (!(vs < ve))
        throw new CustomError("Voting end must be after voting start", 400)

    if (!(ve < ee))
        throw new CustomError("Election end must be after voting ends", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "INSERT INTO elections (name, election_start, election_end, nomination_start, nomination_end, voting_start, voting_end) VALUES ($1, NOW(), $2, $3, $4, $5, $6) RETURNING *",
            [
                electionName,
                electionEnd,
                nominationStart,
                nominationEnd,
                votingStart,
                votingEnd
            ]
        )

        const userIdsRes = await client.query("SELECT id FROM users")
        const userIds = userIdsRes.rows.map((row) => row.id)

        await sendNotification(
            userIds,
            {
                message: `Election "${electionName}" has been created`,
                type: "info"
            },
            client
        )

        await client.query("COMMIT")

        return res.rows[0]
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}

export const deleteElection = async (electionId) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const electionRes = await client.query(
            "SELECT status, name FROM elections WHERE id = $1 FOR UPDATE",
            [electionId]
        )

        if (electionRes.rowCount === 0)
            throw new CustomError("No election found", 404)

        if (electionRes.rows[0].status !== "draft")
            throw new CustomError(
                "This election cannot be deleted in its current state",
                409
            )

        await client.query("DELETE FROM elections WHERE id = $1", [electionId])

        const userIdsRes = await client.query(
            "SELECT id FROM users WHERE role != 'admin'"
        )
        const userIds = userIdsRes.rows.map((row) => row.id)

        const adminUsers = await client.query(
            "SELECT id FROM users WHERE role = 'admin'"
        )
        const adminIds = adminUsers.rows.map((row) => row.id)

        await sendNotification(
            adminIds,
            {
                message: `Election "${electionRes.rows[0].name}" has been deleted`,
                type: "warning"
            },
            client
        )
        await sendNotification(
            userIds,
            {
                message: `Election "${electionRes.rows[0].name}" has been deleted`,
                type: "info"
            },
            client
        )

        await client.query("COMMIT")
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}
