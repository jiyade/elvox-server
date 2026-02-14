import jwt from "jsonwebtoken"
import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"
import { sendNotification } from "./notificationService.js"
import { createLog } from "./logService.js"

export const castVote = async (electionId, data) => {
    const { votingToken, votes } = data

    if (!electionId) throw new CustomError("Election ID is required", 400)
    if (!votingToken) throw new CustomError("Voting token is required", 400)

    const electionCateogryRes = await pool.query(
        "SELECT category_config FROM elections WHERE id = $1",
        [electionId]
    )

    if (electionCateogryRes.rowCount !== 1) {
        throw new CustomError("Election not found", 404)
    }

    if (!votes || typeof votes !== "object" || votes.general == null)
        throw new CustomError("General vote is required", 400)

    const classIdRes = await pool.query(
        "SELECT class_id FROM ballot_entries WHERE id = $1 AND election_id = $2",
        [votes.general, electionId]
    )

    if (classIdRes.rowCount === 0)
        throw new CustomError("Ballot not found", 404)

    const reservedClasses =
        electionCateogryRes.rows[0].category_config.map(Number)

    const hasReserved = reservedClasses.includes(
        Number(classIdRes.rows[0].class_id)
    )

    const allowedKeys = hasReserved ? ["general", "reserved"] : ["general"]
    for (const key of Object.keys(votes)) {
        if (!allowedKeys.includes(key))
            throw new CustomError("Invalid vote payload", 400)
    }

    if (hasReserved) {
        if (votes.reserved == null)
            throw new CustomError(
                "Reserved vote is required for this class",
                400
            )
    } else {
        if ("reserved" in votes)
            throw new CustomError(
                "Reserved vote is not applicable for this class",
                400
            )
    }

    let payload

    try {
        payload = jwt.verify(votingToken, process.env.VOTING_TOKEN_SECRET)
    } catch (err) {
        throw new CustomError(
            "Invalid or expired voting token",
            401,
            "TOKEN_EXPIRED"
        )
    }

    if (
        !payload.admno ||
        !payload.electionId ||
        !payload.deviceId ||
        !payload.scope ||
        payload.scope !== "voting"
    )
        throw new CustomError("Invalid voting token", 401)

    if (payload.electionId !== electionId)
        throw new CustomError("Invalid election context", 403)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const electionRes = await client.query(
            "SELECT status, name FROM elections WHERE id = $1 FOR UPDATE",
            [electionId]
        )

        if (electionRes.rowCount === 0)
            throw new CustomError("Election not found", 404)

        if (electionRes.rows[0].status !== "voting")
            throw new CustomError("Voting is not allowed at this time", 403)

        const hasVotedRes = await client.query(
            "SELECT has_voted FROM voters WHERE admno = $1 AND election_id = $2 FOR UPDATE",
            [payload.admno, electionId]
        )

        if (hasVotedRes.rowCount === 0)
            throw new CustomError("Voter record not found", 404)

        if (hasVotedRes.rows[0].has_voted)
            throw new CustomError("You have already voted", 409)

        const ballotIds = hasReserved
            ? [votes.general, votes.reserved]
            : [votes.general]

        const hasBallotEntryRes = await client.query(
            "SELECT COUNT(*) FROM ballot_entries WHERE id = ANY($1::uuid[]) AND election_id = $2",
            [ballotIds, electionId]
        )

        const expectedCount = ballotIds.length

        if (Number(hasBallotEntryRes.rows[0].count) !== expectedCount)
            throw new CustomError("Invalid ballot entry", 400)

        const insertRes = await client.query(
            `
            INSERT INTO votes (
                election_id,
                ballot_entry_id,
                candidate_id,
                is_nota,
                class_id,
                device_id
            )
            SELECT
                $1 AS election_id,
                be.id AS ballot_entry_id,
                be.candidate_id,
                be.is_nota,
                be.class_id,
                $2 AS device_id
            FROM ballot_entries be
            WHERE be.id = ANY($3::uuid[])
                AND be.election_id = $1
            `,
            [electionId, payload.deviceId, ballotIds]
        )

        if (insertRes.rowCount !== expectedCount)
            throw new CustomError("Invalid ballot entry", 400)

        await client.query(
            "UPDATE voters SET has_voted = true WHERE admno = $1 AND election_id = $2",
            [payload.admno, electionId]
        )

        const studentRes = await client.query(
            "SELECT user_id FROM students WHERE admno = $1",
            [payload.admno]
        )

        if (studentRes.rowCount > 0 && studentRes.rows[0].user_id) {
            await sendNotification(
                [studentRes.rows[0].user_id],
                {
                    message: `Your vote has been recorded successfully`,
                    type: "info",
                    title: "Vote Recorded!"
                },
                client
            )
        }

        await createLog(
            electionId,
            {
                level: "info",
                message: `A vote has been recorded for "${electionRes.rows[0].name}"`
            },
            client
        )

        await client.query("COMMIT")

        return { ok: true, message: "Vote recorded successfully" }
    } catch (err) {
        await client.query("ROLLBACK")

        throw err
    } finally {
        client.release()
    }
}

export const countVotes = async (electionId, client = null) => {
    if (!electionId) throw new Error("Election id is required")
    if (
        !client ||
        typeof client.query !== "function" ||
        typeof client.release !== "function"
    ) {
        throw new Error("Invalid DB client")
    }

    const electionRes = await client.query(
        "SELECT status, name, auto_publish_results, result_published FROM elections WHERE id = $1",
        [electionId]
    )

    if (electionRes.rowCount === 0) throw new Error("Invalid election id")

    if (electionRes.rows[0].result_published)
        throw new Error("Results already published for this election")

    if (electionRes.rows[0].status !== "post-voting")
        throw new Error("Votes can only be counted on post-voting state")

    // Aggregate votes per (class, category, candidate, NOTA) by joining votes with ballot entries
    // Upsert totals into results, default status = 'lost'
    await client.query(
        `
        INSERT INTO results (
            election_id,
            class_id,
            category,
            candidate_id,
            is_nota,
            total_votes,
            result_status
        )
        SELECT
            b.election_id,
            b.class_id,
            b.category,
            b.candidate_id,
            b.is_nota,
            COUNT(v.id) AS total_votes,
            'lost' AS result_status
        FROM ballot_entries b
        LEFT JOIN votes v
            ON v.ballot_entry_id = b.id
            AND v.election_id = $1
        WHERE b.election_id = $1
            AND (
                b.category = 'general'
                OR (
                    b.category = 'reserved'
                    AND b.class_id = ANY(
                        SELECT jsonb_array_elements_text(category_config)::int
                        FROM elections
                        WHERE id = $1
                    )
                )
            )
        GROUP BY
            b.election_id,
            b.class_id,
            b.category,
            b.candidate_id,
            b.is_nota
        ON CONFLICT (election_id, class_id, category, candidate_id, is_nota)
        DO UPDATE SET
            total_votes = EXCLUDED.total_votes,
            result_status = EXCLUDED.result_status
        `,
        [electionId]
    )

    // Compute rank per (election, class, category) based on total_votes
    // Uses RANK() so equal votes share the same rank (ties allowed)
    await client.query(
        `
        WITH ranked AS (
            SELECT
                id,
                RANK() OVER (
                    PARTITION BY election_id, class_id, category
                    ORDER BY total_votes DESC
                ) AS computed_rank
            FROM results
            WHERE election_id = $1
        )
        UPDATE results r
        SET rank = ranked.computed_rank
        FROM ranked
        WHERE r.id = ranked.id
    `,
        [electionId]
    )

    // Set result_status based on rank:
    // rank 1 → WON or TIE (if multiple), others → LOST
    await client.query(
        `
        WITH first_rank AS (
            SELECT
                election_id,
                class_id,
                category,
                COUNT(*) AS first_count
            FROM results
            WHERE election_id = $1 AND rank = 1
            GROUP BY election_id, class_id, category
        )
        UPDATE results r
        SET 
            result_status =
                CASE
                    WHEN r.rank = 1 AND fr.first_count = 1 THEN 'won'
                    WHEN r.rank = 1 AND fr.first_count > 1 THEN 'tie'
                    ELSE 'lost'
                END,
            had_tie =
                CASE
                    WHEN r.rank = 1 AND fr.first_count > 1 THEN true
                    ELSE r.had_tie
                END
        FROM first_rank fr
        WHERE r.election_id = fr.election_id
        AND r.class_id = fr.class_id
        AND r.category = fr.category
        AND r.election_id = $1
    `,
        [electionId]
    )

    await createLog(
        electionId,
        {
            level: "info",
            message: `Vote counting completed for election "${electionRes.rows[0].name}" by system`
        },
        client
    )

    // Auto-publish results if enabled
    if (electionRes.rows[0].auto_publish_results) {
        await client.query(
            "UPDATE elections SET result_published = TRUE WHERE id = $1",
            [electionId]
        )

        await createLog(
            electionId,
            {
                level: "info",
                message: `Results published for election "${electionRes.rows[0].name}" by system`
            },
            client
        )

        const userIdRes = await client.query("SELECT id FROM users")

        const userIds = userIdRes.rows.map((row) => row.id)

        await sendNotification(
            userIds,
            {
                message: `Results published for election "${electionRes.rows[0].name}"`,
                type: "info",
                title: "Results Published!"
            },
            client
        )

        const tiedClassRes = await client.query(
            "SELECT DISTINCT class_id FROM results WHERE election_id = $1 AND result_status = 'tie'",
            [electionId]
        )

        if (tiedClassRes.rowCount === 0) return

        const classIds = tiedClassRes.rows.map((r) => r.class_id)

        const tiedClassTutorRes = await client.query(
            "SELECT user_id FROM teachers WHERE tutor_of = ANY($1)",
            [classIds]
        )

        if (tiedClassTutorRes.rowCount === 0) return

        const tutorIds = tiedClassTutorRes.rows.map((r) => r.user_id)

        await sendNotification(tutorIds, {
            message: `Tie detected in your class. Please conduct a tie-breaker and submit the results`,
            type: "info",
            title: "Tie detected!"
        })
    }
}
