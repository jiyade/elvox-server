import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { sendNotification } from "../services/notificationService.js"
import { createLog } from "../services/logService.js"

const isUUID = (v) =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v
    )

export const getClassTieBreakerStatus = async (electionId, classId) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!classId) throw new CustomError("Class id is required", 400)

    const res = await pool.query(
        `
        SELECT
            r.category,
            json_agg(
                json_build_object(
                    'id', r.id,
                    'candidateId', r.candidate_id,
                    'name', CASE
                        WHEN r.is_nota THEN 'NOTA'
                        ELSE c.name
                    END,
                    'totalVotes', r.total_votes,
                    'rank', r.rank,
                    'isNota', r.is_nota
                )
                ORDER BY r.rank
            ) AS candidates
            FROM results r
            LEFT JOIN candidates c ON c.id = r.candidate_id
            JOIN elections e ON e.id = $1
            WHERE e.result_published = true
            AND r.election_id = $1
            AND r.class_id = $2
            AND r.result_status = 'tie'
            GROUP BY r.category;
            `,
        [electionId, classId]
    )

    if (res.rowCount === 0) {
        return { hasTie: false }
    }

    return {
        hasTie: true,
        categories: res.rows
    }
}

export const resolveTieBreaker = async (electionId, classId, data, user) => {
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!classId) throw new CustomError("Class id is required", 400)

    if (!Array.isArray(data) || data.length === 0)
        throw new CustomError("Invalid payload", 400)

    const resultIds = new Set()
    const ranks = new Set()

    for (const item of data) {
        if (!item.resultId || !isUUID(item.resultId))
            throw new CustomError("Invalid resultId", 400)

        if (!Number.isInteger(item.finalRank) || item.finalRank <= 0)
            throw new CustomError("Invalid finalRank", 400)

        if (resultIds.has(item.resultId))
            throw new CustomError("Duplicate resultId", 400)

        if (ranks.has(item.finalRank))
            throw new CustomError("Duplicate finalRank", 400)

        resultIds.add(item.resultId)
        ranks.add(item.finalRank)
    }

    const electionRes = await pool.query(
        "SELECT status, result_published, name FROM elections WHERE id = $1 LIMIT 1",
        [electionId]
    )

    if (electionRes.rowCount === 0)
        throw new CustomError("Election not found", 404)
    if (!electionRes.rows[0].result_published)
        throw new CustomError("Election results are not published yet", 409)
    if (electionRes.rows[0].status !== "post-voting")
        throw new CustomError(
            "Tie-breaker can only be resolved in post-voting stage",
            409
        )

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "SELECT * FROM results WHERE id = ANY($1) AND election_id = $2 AND class_id = $3 AND result_status = 'tie' FOR UPDATE",
            [[...resultIds], electionId, classId]
        )

        if (res.rowCount !== data.length)
            throw new CustomError("Invalid or mismatched resultIds", 409)

        const category = res.rows[0].category

        for (const row of res.rows) {
            if (row.category !== category)
                throw new CustomError("Mixed categories in tie-breaker", 409)
        }

        const firstLostRes = await client.query(
            `
            SELECT rank
            FROM results
            WHERE election_id = $1
                AND category = $2
                AND class_id = $3
                AND rank > 1
            ORDER BY rank ASC
            LIMIT 1
            FOR UPDATE
            `,
            [electionId, category, classId]
        )

        const firstLostRank = firstLostRes.rowCount
            ? firstLostRes.rows[0].rank
            : Infinity

        for (const rank of ranks) {
            if (rank < 1 || rank >= firstLostRank) {
                throw new CustomError("Invalid finalRank", 409)
            }
        }

        const updateData = data.map((d) => [d.resultId, d.finalRank])

        const updateRes = await client.query(
            `
            UPDATE results r
            SET
                rank = updates.final_rank,
                result_status = CASE
                    WHEN updates.final_rank = 1 THEN 'won'
                    ELSE 'lost'
                END
            FROM (
                SELECT *
                    FROM UNNEST($1::uuid[], $2::int[])
                        AS updates(result_id, final_rank)
            ) updates
            WHERE r.id = updates.result_id
                AND r.category = $3
            `,
            [updateData.map((u) => u[0]), updateData.map((u) => u[1]), category]
        )

        const classRes = await client.query(
            "SELECT name FROM classes WHERE id = $1 LIMIT 1",
            [classId]
        )

        if (updateRes.rowCount !== data.length) {
            await createLog(
                electionId,
                {
                    level: "warning",
                    message: `Tie-breaker update affected ${updateRes.rowCount}/${data.length} rows for class ${classRes.rows[0].name}`
                },
                client
            )

            throw new CustomError("Failed to resolve all tied results", 409)
        }

        const usersRes = await client.query(
            "SELECT user_id FROM students WHERE class_id = $1 AND user_id IS NOT NULL",
            [classId]
        )

        const userIds = usersRes.rows.map((r) => r.user_id)

        await createLog(
            electionId,
            {
                level: "info",
                message: `Tie-breaker resolved by Tutor ${user?.name} for class ${classRes.rows[0].name} for election "${electionRes.rows[0].name}"
`
            },
            client
        )

        await sendNotification(
            [...userIds, user?.id],
            {
                message: "Tie-breaker resolved for your class",
                type: "info",
                title: "Tie-breaker resolved!"
            },
            client
        )

        await client.query("COMMIT")

        return {
            ok: true,
            message: "Tie-break resolved successfully"
        }
    } catch (err) {
        await client.query("ROLLBACK")

        throw err
    } finally {
        client.release()
    }
}
