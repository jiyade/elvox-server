import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { uploadFile, deleteFile, getURL } from "../utils/file.js"
import { getElectionDetails } from "./electionService.js"
import { getStudent } from "./studentService.js"
import { sendNotification } from "./notificationService.js"
import { createLog } from "./logService.js"

export const createCandidate = async (data) => {
    if (!data?.body?.election_id)
        throw new CustomError("Election is required", 400)
    if (!data?.body?.category)
        throw new CustomError("Category is required", 400)
    if (!["general", "reserved"].includes(data?.body?.category.toLowerCase()))
        throw new CustomError("Invalid category", 400)
    if (
        data?.body?.category.toLowerCase() === "reserved" &&
        data?.user?.gender !== "female"
    )
        throw new CustomError(
            "Male candidates cannot apply under reserved category",
            409
        )
    if (!data?.body?.nominee1Admno)
        throw new CustomError("Nominee 1 admission number is required", 400)
    if (!data?.body?.nominee2Admno)
        throw new CustomError("Nominee 2 admission number is required", 400)

    if (
        data?.user?.admno === data?.body?.nominee1Admno ||
        data?.user?.admno === data?.body?.nominee2Admno
    )
        throw new CustomError(
            "You cannot choose yourself as your own nominee",
            403
        )

    if (data?.body?.nominee1Admno === data?.body?.nominee2Admno)
        throw new CustomError("Nominees cannot be the same person", 403)

    if (!data?.files?.signature?.[0])
        throw new CustomError("Signature is required", 400)
    if (!data?.files?.nominee1Proof?.[0])
        throw new CustomError("Nominee 1 proof is required", 400)
    if (!data?.files?.nominee2Proof?.[0])
        throw new CustomError("Nominee 2 proof is required", 400)

    const election = await getElectionDetails(data.body.election_id)

    if (election?.status === "closed")
        throw new CustomError("Election is closed", 409)

    if (election?.status === "draft")
        throw new CustomError("Nomination period has not started yet", 409)

    if (["pre-voting", "voting", "post-voting"].includes(election?.status))
        throw new CustomError("Nominations are closed", 409)

    if (data.user.semester > 8)
        throw new CustomError("Student is not eligible for nomination", 409)

    const existing = await pool.query(
        "SELECT * FROM candidates WHERE user_id = $1 AND election_id = $2",
        [data.user.id, election.id]
    )

    if (existing.rowCount > 0)
        throw new CustomError(
            "Candidate application already submitted for this user",
            409
        )

    const { rowCount } = await pool.query(
        `
        SELECT 1
        FROM elections
        WHERE id = $1
        AND category_config @> to_jsonb($2::int)
        `,
        [election.id, Number(data.user.class_id)]
    )

    if (data.body.category?.toLowerCase() === "reserved" && rowCount === 0) {
        throw new CustomError(
            "Your class is not allowed to apply under reserved category",
            403
        )
    }

    const nominee1 = await getStudent(data.body.nominee1Admno)
    const nominee2 = await getStudent(data.body.nominee2Admno)

    if (
        data?.user?.class_id !== nominee1?.class_id ||
        data?.user?.class_id !== nominee2?.class_id
    )
        throw new CustomError(
            "Nominees must be of the same class as the candidate",
            403
        )

    let signature, nominee1Proof, nominee2Proof

    const client = await pool.connect()

    try {
        signature = await uploadFile(
            data.files.signature[0],
            "signatures",
            data.user.admno
        )

        nominee1Proof = await uploadFile(
            data.files.nominee1Proof[0],
            "nominee-proofs",
            data.body.nominee1Admno
        )

        nominee2Proof = await uploadFile(
            data.files.nominee2Proof[0],
            "nominee-proofs",
            data.body.nominee2Admno
        )

        await client.query("BEGIN")

        const res = await client.query(
            "INSERT INTO candidates (election_id, user_id, name, category, department_id, department, class_id, class, semester, profile_pic, signature, nominee1_admno, nominee1_name, nominee1_proof, nominee2_admno, nominee2_name, nominee2_proof) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING  election_id, name, category, nominee1_name, nominee2_name, created_at",
            [
                election.id,
                data.user.id,
                data.user.name,
                data.body.category.toLowerCase(),
                data.user.department_id,
                data.user.department,
                data.user.class_id,
                data.user.class,
                data.user.semester,
                data.user.profile_pic,
                getURL(signature.path),
                nominee1.admno,
                nominee1.name,
                getURL(nominee1Proof.path),
                nominee2.admno,
                nominee2.name,
                getURL(nominee2Proof.path)
            ]
        )

        const tutorRes = await client.query(
            "SELECT user_id from teachers WHERE tutor_of = $1",
            [data.user.class_id]
        )

        const tutorNotificationOptions = {
            message:
                "A new candidate application has been submitted and is awaiting your review",
            type: "info",
            title: "New candidate application"
        }
        const studentNotificationOptions = {
            message:
                "Your candidate application has been submitted successfully and is awaiting review by your tutor",
            type: "info",
            title: "Application submitted"
        }

        await createLog(
            election.id,
            {
                level: "info",
                message: `Candidate created: "${data.user.name}" (id: ${data.user.id}) for election "${election.name}"`
            },
            client
        )

        await sendNotification(
            [tutorRes.rows[0].user_id],
            tutorNotificationOptions,
            client
        )

        await sendNotification(
            [data.user.id],
            studentNotificationOptions,
            client
        )

        await client.query("COMMIT")

        if (res.rowCount === 0)
            throw new CustomError("Something went wrong", 500)

        return { message: "Candidate application submitted", data: res.rows[0] }
    } catch (err) {
        await client.query("ROLLBACK")
        await Promise.all([
            deleteFile(signature.path),
            deleteFile(nominee1Proof.path),
            deleteFile(nominee2Proof.path)
        ])
        throw err
    } finally {
        client.release()
    }
}

export const getMyCandidate = async ({ userId, electionId }) => {
    if (!userId) throw new CustomError("User id is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)

    const res = await pool.query(
        "SELECT actioned_by, actioned_by_name, class, class_id, created_at, department, department_id, election_id, id, name, nominee1_admno, nominee1_name, nominee2_admno, nominee2_name, category, profile_pic, rejection_reason, semester, status, updated_at, user_id FROM candidates WHERE user_id = $1 AND status != 'withdrawn' AND election_id = $2",
        [userId, electionId]
    )

    if (res.rowCount === 0)
        throw new CustomError("No candidate application found", 404)

    const election = await getElectionDetails(res.rows[0].election_id)

    if (election.status === "closed")
        throw new CustomError("Election is closed", 403)

    return res.rows[0]
}

export const checkCandidateExists = async (userId, electionId) => {
    if (!userId) throw new CustomError("User id is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)

    const res = await pool.query(
        "SELECT status FROM candidates WHERE user_id = $1 AND election_id = $2",
        [userId, electionId]
    )

    if (res.rowCount === 0) return { exists: false }

    const election = await getElectionDetails(electionId)

    if (election.status === "closed") return { exists: false }

    return { exists: true, status: res.rows[0].status }
}

export const getCandidate = async (data) => {
    const { id, user } = data

    if (!id) throw new CustomError("Candidate id is required", 400)

    const res = await pool.query("SELECT * FROM candidates WHERE id = $1", [id])

    if (res.rowCount === 0)
        throw new CustomError("No candidate application found", 404)

    if (Number(res.rows[0].class_id) !== Number(user.tutor_of))
        throw new CustomError(
            "This candidate does not belong to your class",
            403
        )

    return res.rows[0]
}

export const getCandidates = async (data) => {
    const {
        query: { status },
        user: { role }
    } = data

    if (!status) throw new CustomError("Status is required", 400)

    if (role === "admin") {
        if (
            !["all", "approved", "pending", "rejected", "withdrawn"].includes(
                status
            )
        )
            throw new CustomError("Invalid status", 400)

        let query =
            "SELECT name, id, election_id, category, department, class, semester, profile_pic, status, actioned_by, updated_at, created_at FROM candidates WHERE election_id IN ( SELECT id FROM elections WHERE status != 'closed')"

        const values = []

        if (status !== "all") {
            query += " AND status = $1"
            values.push(status)
        }

        const res = await pool.query(query, values)

        return res.rows
    }

    if (status === "approved") {
        const res = await pool.query(
            "SELECT name, id, election_id, category, department, class, semester, profile_pic, status, actioned_by, updated_at, created_at FROM candidates WHERE status = $1 AND election_id IN ( SELECT id FROM elections WHERE status != 'closed')",
            [status]
        )

        return res.rows
    } else {
        throw new CustomError("Invalid status", 400)
    }
}

export const getPendingCandidates = async (user) => {
    const { tutor_of, role } = user

    if (role === "student") throw new CustomError("Forbidden", 403)

    if (!tutor_of)
        throw new CustomError(
            "You must need to be a tutor to access pending candidate applications",
            403
        )

    const res = await pool.query(
        `
            SELECT
                c.name,
                c.id,
                c.election_id,
                c.profile_pic,
                c.status,
                c.category,
                c.department,
                c.class,
                c.signature,
                c.nominee1_admno,
                c.nominee2_admno,
                c.nominee1_proof,
                c.nominee2_proof,
                c.nominee1_name,
                c.nominee2_name,
                c.semester,
                c.created_at,
                s.admno
            FROM candidates c
            JOIN students s ON s.user_id = c.user_id
            WHERE c.status = 'pending'
                AND c.class_id = $1
                AND c.election_id IN (SELECT id FROM elections WHERE status = 'nominations')
            `,
        [tutor_of]
    )

    return res.rows
}

export const getBallotEntries = async (classId, electionId) => {
    if (!classId) throw new CustomError("Class ID is required", 400)
    if (!electionId) throw new CustomError("Election ID is required", 400)

    const res = await pool.query(
        `SELECT
            be.id AS ballot_entry_id,
            c.id AS candidate_id,
            c.name,
            c.profile_pic,
            c.semester,
            be.category,
            be.is_nota,
            cl.id AS class_id,
            cl.name AS class
        FROM ballot_entries be
        LEFT JOIN candidates c ON c.id = be.candidate_id
        JOIN classes cl ON cl.id = be.class_id
        WHERE be.election_id = $1 AND be.class_id = $2
        ORDER BY be.is_nota ASC, c.name ASC NULLS LAST;
        `,
        [electionId, classId]
    )

    const candidates = { general: [], reserved: [] }

    if (res.rowCount === 0) return candidates

    res.rows.forEach((row) => {
        if (!candidates[row.category]) {
            throw new CustomError(`Unknown category: ${row.category}`, 500)
        }

        candidates[row.category].push(row)
    })

    return candidates
}

export const withdrawCandidate = async (data) => {
    const { id, election_id } = data

    if (!id) throw new CustomError("Candidate id is required", 400)
    if (!election_id) throw new CustomError("Election id is required", 400)

    const election = await getElectionDetails(election_id)

    if (election?.status !== "nominations")
        throw new CustomError(
            "Withdrawing application is only allowed during nomination period",
            403
        )

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        // 1. Lock + read current status
        const res = await client.query(
            `
            SELECT status, user_id, name, class_id
            FROM candidates
            WHERE id = $1
            FOR UPDATE`,
            [id]
        )

        if (res.rowCount === 0)
            throw new CustomError("No candidate application found", 404)

        const prevStatus = res.rows[0].status

        if (!["approved", "pending"].includes(prevStatus))
            throw new CustomError("Candidate cannot be withdrawn", 400)

        // 2. Update status
        await client.query(
            `
            UPDATE candidates
            SET status = 'withdrawn'
            WHERE id = $1`,
            [id]
        )

        const tutorRes = await client.query(
            "SELECT user_id from teachers WHERE tutor_of = $1",
            [res.rows[0].class_id]
        )

        const studentNotificationOptions = {
            message:
                "Your candidate application has been successfully withdrawn",
            type: "success",
            title: "Application withdrawn"
        }
        const tutorNotificationOptions = {
            message:
                "A candidate application has been withdrawn from your class",
            type: "info",
            title: "Application withdrawn"
        }

        await createLog(
            election.id,
            {
                level: "info",
                message: `Candidate withdrawn: "${res.rows[0].name}" (id: ${res.rows[0].user_id}) for election "${election.name}"`
            },
            client
        )

        await sendNotification(
            [res.rows[0].user_id],
            studentNotificationOptions,
            client
        )
        await sendNotification(
            [tutorRes.rows[0].user_id],
            tutorNotificationOptions,
            client
        )

        await client.query("COMMIT")

        return { message: "Candidate application withdrawn successfully" }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}

export const reviewCandidate = async (candidateId, body, user) => {
    const { status, rejectionReason, electionId } = body
    const { id: tutorUserId, name: tutorName, tutor_of: tutorId } = user

    if (!candidateId) throw new CustomError("Candidate id is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!status) throw new CustomError("Status is required", 400)

    if (!["approved", "rejected"].includes(status))
        throw new CustomError("Invalid status", 400)

    if (status === "rejected" && !rejectionReason)
        throw new CustomError("Rejection reason is required", 400)

    if (!tutorUserId || !tutorName)
        throw new CustomError("Reviewer's name and user id is required", 400)

    const election = await getElectionDetails(electionId)

    if (election?.status !== "nominations")
        throw new CustomError(
            `Approving or rejecting application is only allowed during nomination period`,
            409
        )

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        // 1. Lock candidate row
        const { rows } = await client.query(
            `
            SELECT status, class_id, user_id, name
            FROM candidates
            WHERE id = $1
            FOR UPDATE`,
            [candidateId]
        )

        if (rows.length === 0)
            throw new CustomError("No candidate application found", 404)

        const {
            status: currentStatus,
            class_id,
            user_id: userId,
            name
        } = rows[0]

        if (currentStatus === "withdrawn")
            throw new CustomError(
                "Candidate already withdrew their application",
                409
            )

        if (currentStatus !== "pending")
            throw new CustomError("Candidate already reviewed", 409)

        if (tutorId !== class_id)
            throw new CustomError(
                "You are not authorized to review this candidate",
                403
            )

        // 2. Update status
        await client.query(
            "UPDATE candidates SET status = $1, actioned_by = $2, rejection_reason = $3, actioned_by_name = $4 WHERE id = $5",
            [status, tutorUserId, rejectionReason, tutorName, candidateId]
        )

        const notificationOptions =
            status === "approved"
                ? {
                      message: "Your candidate application has been approved",
                      type: "success",
                      title: "Application approved"
                  }
                : {
                      message:
                          "Your candidate application has been rejected. Please check the reason provided by your tutor",
                      type: "error",
                      title: "Application rejected"
                  }

        await createLog(
            election.id,
            {
                level: "info",
                message: `Candidate ${status}: "${name}" for election "${election.name}" by Tutor ${tutorName} (id: ${tutorUserId})`
            },
            client
        )

        await sendNotification([userId], notificationOptions, client)

        await client.query("COMMIT")

        return {
            message: `Candidate application ${status} successfully`
        }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}
