import crypto from "crypto"
import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { sendNotification } from "./notificationService.js"
import hashSecretKey from "../utils/hashSecretKey.js"
import capitalize from "../utils/capitalize.js"
import { createLog } from "./logService.js"

export const getElection = async (role) => {
    const res = await pool.query(
        "SELECT * FROM elections WHERE status != 'closed' ORDER BY election_start DESC LIMIT 1"
    )

    if (res.rowCount === 0) return null

    let totalActivatedSystems = 0

    if (role === "admin") {
        const votingDevicesRes = await pool.query(
            "SELECT COUNT(*) FROM voting_devices WHERE election_id = $1 AND revoked_at IS NULL",
            [res.rows[0].id]
        )

        totalActivatedSystems = votingDevicesRes.rows[0].count
    }

    const {
        desktop_voting_key_hash,
        desktop_voting_key_generated_at,
        ...data
    } = res.rows[0]

    return {
        ...data,
        ...(role === "admin" && {
            hasSecretKey: desktop_voting_key_hash !== null,
            totalActivatedSystems
        })
    }
}

export const getElectionDetails = async (id) => {
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

export const updateSupervisors = async (user, electionId, payload) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!payload?.add || !payload?.remove)
        throw new CustomError("Invalid payload", 400)

    if (!Array.isArray(payload.add) || !Array.isArray(payload.remove))
        throw new CustomError("Invalid payload", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const { rows } = await client.query(
            "SELECT name, NOW() > voting_end AS voting_ended FROM elections WHERE id = $1 FOR UPDATE",
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

            await sendNotification(
                removeIds,
                {
                    message: "You have been removed from supervisors",
                    type: "info"
                },
                client
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

            await sendNotification(
                addIds,
                {
                    message: "You have been added as a supervisor",
                    type: "info"
                },
                client
            )

            addedCount = res.rowCount
        }

        if (addedCount > 0 || removedCount > 0) {
            await createLog(
                electionId,
                {
                    level: "info",
                    message: `Supervisors updated for election "${
                        rows[0].name
                    }" by ${capitalize(user.role)} ${user.name} (id: ${
                        user.id
                    })`
                },
                client
            )
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

export const createElection = async (user, data) => {
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

        await createLog(
            res.rows[0].id,
            {
                level: "info",
                message: `Election created: "${electionName}" by ${capitalize(
                    user.role
                )} ${user.name} (id: ${user.id})`
            },
            client
        )

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

export const deleteElection = async (user, electionId) => {
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

        await createLog(
            electionId,
            {
                level: "warning",
                message: `Election deleted: "${
                    electionRes.rows[0].name
                }" by ${capitalize(user.role)} ${user.name} (id: ${user.id})`
            },
            client
        )

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

export const updateElection = async (user, electionId, data) => {
    if (!electionId) throw new CustomError("Election id is required", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const electionRes = await client.query(
            "SELECT * FROM elections WHERE id = $1 FOR UPDATE",
            [electionId]
        )

        if (electionRes.rowCount === 0)
            throw new CustomError("No election found", 404)

        const EDITABLE_FIELDS = {
            draft: [
                "name",
                "nomination_start",
                "nomination_end",
                "voting_start",
                "voting_end",
                "election_end"
            ],
            nominations: [
                "nomination_end",
                "voting_start",
                "voting_end",
                "election_end"
            ],
            "pre-voting": ["voting_start", "voting_end", "election_end"],
            voting: ["voting_end", "election_end"],
            "post-voting": ["election_end"],
            closed: []
        }

        const clientToDBMap = {
            electionName: "name",
            nominationStart: "nomination_start",
            nominationEnd: "nomination_end",
            votingStart: "voting_start",
            votingEnd: "voting_end",
            electionEnd: "election_end"
        }

        for (const key of Object.keys(data)) {
            const dbField = clientToDBMap[key]

            if (!dbField) {
                throw new CustomError("Invalid field in request", 400)
            }

            if (
                !EDITABLE_FIELDS[electionRes.rows[0].status].includes(dbField)
            ) {
                throw new CustomError(
                    `Field '${key}' cannot be updated when election is in '${electionRes.rows[0].status}' state`,
                    409
                )
            }
        }

        if (Object.keys(data).length === 0)
            throw new CustomError("No fields provided to update", 400)

        const updated = {
            name: data.electionName ?? electionRes.rows[0].name,
            nomination_start:
                data.nominationStart ?? electionRes.rows[0].nomination_start,
            nomination_end:
                data.nominationEnd ?? electionRes.rows[0].nomination_end,
            voting_start: data.votingStart ?? electionRes.rows[0].voting_start,
            voting_end: data.votingEnd ?? electionRes.rows[0].voting_end,
            election_end: data.electionEnd ?? electionRes.rows[0].election_end
        }

        const now = new Date()

        if (electionRes.rows[0].status === "draft") {
            if (updated.nomination_start <= now)
                throw new CustomError(
                    "Nomination start must be in the future",
                    400
                )

            if (updated.nomination_start >= updated.nomination_end)
                throw new CustomError("Nomination end must be after start", 400)

            if (updated.nomination_end >= updated.voting_start)
                throw new CustomError(
                    "Voting must start after nominations",
                    400
                )

            if (updated.voting_start >= updated.voting_end)
                throw new CustomError("Voting end must be after start", 400)

            if (updated.voting_end >= updated.election_end)
                throw new CustomError(
                    "Election end must be after voting ends",
                    400
                )
        }
        if (electionRes.rows[0].status === "nominations") {
            if (updated.nomination_start >= updated.nomination_end)
                throw new CustomError("Nomination end must be after start", 400)

            if (updated.nomination_end >= updated.voting_start)
                throw new CustomError(
                    "Voting must start after nominations",
                    400
                )

            if (updated.voting_start >= updated.voting_end)
                throw new CustomError("Voting end must be after start", 400)

            if (updated.voting_end >= updated.election_end)
                throw new CustomError(
                    "Election end must be after voting ends",
                    400
                )
        }
        if (electionRes.rows[0].status === "pre-voting") {
            if (updated.nomination_end >= updated.voting_start)
                throw new CustomError(
                    "Voting must start after nominations",
                    400
                )

            if (updated.voting_start >= updated.voting_end)
                throw new CustomError("Voting end must be after start", 400)

            if (updated.voting_end >= updated.election_end)
                throw new CustomError(
                    "Election end must be after voting ends",
                    400
                )
        }
        if (electionRes.rows[0].status === "voting") {
            if (updated.voting_start >= updated.voting_end)
                throw new CustomError("Voting end must be after start", 400)

            if (updated.voting_end >= updated.election_end)
                throw new CustomError(
                    "Election end must be after voting ends",
                    400
                )
        }
        if (electionRes.rows[0].status === "post-voting") {
            if (updated.voting_end >= updated.election_end)
                throw new CustomError(
                    "Election end must be after voting ends",
                    400
                )
        }

        const res = await client.query(
            `
            UPDATE elections
            SET
            name = $1,
            nomination_start = $2,
            nomination_end = $3,
            voting_start = $4,
            voting_end = $5,
            election_end = $6
            WHERE id = $7
            RETURNING *
            `,
            [
                updated.name,
                updated.nomination_start,
                updated.nomination_end,
                updated.voting_start,
                updated.voting_end,
                updated.election_end,
                electionId
            ]
        )

        const userIdsRes = await client.query("SELECT id FROM users")
        const userIds = userIdsRes.rows.map((row) => row.id)

        await createLog(
            electionId,
            {
                level: "info",
                message: `Election updated: "${
                    electionRes.rows[0].name
                }" by ${capitalize(user.role)} ${user.name} (id: ${user.id})`
            },
            client
        )

        await sendNotification(
            userIds,
            {
                message: `Election "${electionRes.rows[0].name}" has been updated`,
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

export const getReservedClasses = async (id) => {
    if (!id) throw new CustomError("Election id is required", 400)

    const res = await pool.query(
        "SELECT status, category_config FROM elections WHERE id = $1",
        [id]
    )

    if (res.rowCount === 0) throw new CustomError("No election found", 404)

    return res.rows[0].category_config
}

export const updateReservedClasses = async (user, id, data) => {
    if (!id) throw new CustomError("Election id is required", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "SELECT status, name FROM elections WHERE id = $1 FOR UPDATE",
            [id]
        )

        if (res.rowCount === 0) throw new CustomError("No election found", 404)

        if (res.rows[0].status !== "draft")
            throw new CustomError(
                "Reserved category can only be configured while the election is in draft state",
                409
            )

        await client.query(
            "UPDATE elections SET category_config = $1::jsonb WHERE id = $2",
            [JSON.stringify(data.classIds.map(Number)), id]
        )

        await createLog(
            id,
            {
                level: "info",
                message: `Reserved classes updated for election "${
                    res.rows[0].name
                }" by ${capitalize(user.role)} ${user.name} (id: ${user.id})`
            },
            client
        )

        await client.query("COMMIT")

        return { message: "Reserved classes updated successfully" }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}

export const updateAutoPublishResults = async (id, data) => {
    if (!id) throw new CustomError("Election id is required", 400)

    if (typeof data.autoPublish !== "boolean")
        throw new CustomError("Invalid input", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "SELECT status, name FROM elections WHERE id = $1 FOR UPDATE",
            [id]
        )

        if (res.rowCount === 0) throw new CustomError("No election found", 404)

        const NOT_ALLOWED = ["post-voting", "closed"]

        if (NOT_ALLOWED.includes(res.rows[0].status))
            throw new CustomError(
                "Auto publish results can only be changed before post-voting",
                409
            )

        await client.query(
            "UPDATE elections SET auto_publish_results = $1 WHERE id = $2",
            [data.autoPublish, id]
        )

        await createLog(
            id,
            {
                level: "info",
                message: `Auto-publish results setting updated for election "${
                    res.rows[0].name
                }" by ${capitalize(user.role)} ${user.name} (id: ${user.id})`
            },
            client
        )

        await client.query("COMMIT")

        return { message: "Auto publish results updated successfully" }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}

// GENERATES OR REGENERATES THE SECRET KEY
export const generateSecretKey = async (user, id) => {
    if (!id) throw new CustomError("Election id is required", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "SELECT status, name, desktop_voting_key_hash FROM elections WHERE id = $1 FOR UPDATE",
            [id]
        )

        if (res.rowCount === 0) throw new CustomError("No election found", 404)

        const ALLOWED = ["pre-voting", "voting"]

        if (!ALLOWED.includes(res.rows[0].status))
            throw new CustomError(
                "Secret key can only be generated during pre-voting and voting",
                409
            )

        const plainKey = crypto.randomBytes(32).toString("hex")

        const hashedKey = hashSecretKey(plainKey)

        await client.query(
            `
            UPDATE elections
            SET desktop_voting_key_hash = $1,
            desktop_voting_key_generated_at = NOW()
            WHERE id = $2
            `,
            [hashedKey, id]
        )

        await createLog(
            id,
            {
                level: "warning",
                message: `Secret key ${
                    res.rows[0].desktop_voting_key_hash === null
                        ? "generated"
                        : "regenerated"
                } for election "${res.rows[0].name}" by ${capitalize(
                    user.role
                )} ${user.name} (id: ${user.id})`
            },
            client
        )

        await client.query("COMMIT")

        return { secretKey: plainKey }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}
