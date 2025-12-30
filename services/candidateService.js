import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { uploadFile, deleteFile, getURL } from "../utils/file.js"
import { getElection } from "./electionService.js"
import { getStudent } from "./studentService.js"

export const createCandidate = async (data) => {
    if (!data?.body?.election_id)
        throw new CustomError("Election is required", 400)
    if (!data?.body?.position)
        throw new CustomError("Position is required", 400)
    if (!data?.body?.nominee1Admno)
        throw new CustomError("Nominee 1 admission number is required", 400)
    if (!data?.body?.nominee2Admno)
        throw new CustomError("Nominee 2 admission number is required", 400)
    if (!data?.files?.signature?.[0])
        throw new CustomError("Signature is required", 400)
    if (!data?.files?.nominee1Proof?.[0])
        throw new CustomError("Nominee 1 proof is required", 400)
    if (!data?.files?.nominee2Proof?.[0])
        throw new CustomError("Nominee 2 proof is required", 400)

    const election = await getElection(data.body.election_id)

    if (Date.now() < new Date(election.nomination_start))
        throw new CustomError("Nomination period has not started yet", 403)

    if (Date.now() > new Date(election.nomination_end))
        throw new CustomError("Nominations are closed", 403)

    if (data.user.semester > 8)
        throw new CustomError("Student is not eligible for nomination", 403)

    const existing = await pool.query(
        "SELECT * FROM candidates WHERE user_id = $1 AND election_id = $2",
        [data.user.id, election.id]
    )

    if (existing.rowCount > 0)
        throw new CustomError(
            "Candidate application already submitted for this user",
            409
        )

    const nominee1 = await getStudent(data.body.nominee1Admno)
    const nominee2 = await getStudent(data.body.nominee2Admno)

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
            "INSERT INTO candidates (election_id, user_id, name, position, department_id, department, class_id, class, semester, profile_pic, signature, nominee1_admno, nominee1_name, nominee1_proof, nominee2_admno, nominee2_name, nominee2_proof) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING  election_id, name, position, nominee1_name, nominee2_name, created_at",
            [
                election.id,
                data.user.id,
                data.user.name,
                data.body.position,
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
        "SELECT actioned_by, actioned_by_name, class, class_id, created_at, department, department_id, election_id, id, name, nominee1_admno, nominee1_name, nominee2_admno, nominee2_name, position, profile_pic, rejection_reason, semester, status, updated_at, user_id FROM candidates WHERE user_id = $1 AND status != 'withdrawn' AND election_id = $2",
        [userId, electionId]
    )

    if (res.rowCount === 0)
        throw new CustomError("No candidate application found", 404)

    const election = await getElection(res.rows[0].election_id)

    if (election.status === "closed")
        throw new CustomError("Election is closed", 403)

    return res.rows[0]
}

export const checkCandidateExists = async (userId) => {
    if (!userId) throw new CustomError("User id is required", 400)

    const res = await pool.query(
        "SELECT status, election_id FROM candidates WHERE user_id = $1",
        [userId]
    )

    if (res.rowCount === 0) return { exists: false }

    const election = await getElection(res.rows[0].election_id)
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
        user: { tutor_of, role }
    } = data

    if (!status) throw new CustomError("Status is required", 400)

    let candidates

    if (status === "pending") {
        if (role === "student") throw new CustomError("Forbidden", 403)
        if (!tutor_of)
            throw new CustomError(
                "You must need to be a tutor to access pending candidate applications",
                403
            )

        const res = await pool.query(
            "SELECT name, id, election_id, profile_pic, status, created_at FROM candidates WHERE status = $1 AND class_id = $2",
            [status, tutor_of]
        )

        candidates = res.rows
    } else if (status === "approved") {
        const res = await pool.query(
            "SELECT name, id, election_id, position, department, class, semester, profile_pic, status, actioned_by, updated_at FROM candidates WHERE status = $1",
            [status]
        )

        candidates = res.rows
    } else {
        throw new CustomError("Inalid status", 400)
    }

    return candidates
}

export const withdrawCandidate = async (data) => {
    const { id, election_id } = data

    if (!id) throw new CustomError("Candidate id is required", 400)
    if (!election_id) throw new CustomError("Election id is required", 400)

    const election = await getElection(election_id)

    if (Date.now > new Date(election.nomination_end))
        throw new CustomError(
            "Cannot withdraw after nomination period ends",
            403
        )

    const res = await pool.query(
        "UPDATE candidates SET status = 'withdrawn' WHERE id = $1",
        [id]
    )

    if (res.rowCount === 0)
        throw new CustomError("No candidate application found", 404)

    return { message: "Candidate application withdrawn successfully" }
}
