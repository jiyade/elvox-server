import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { uploadFile, deleteFile, getURL } from "../utils/file.js"
import { getElection } from "./electionService.js"
import { getStudent } from "./studentService.js"

export const createCandidate = async (data) => {
    if (!data?.body?.election_id)
        throw new CustomError("Election id is required")
    if (!data?.body?.position) throw new CustomError("Position is required")
    if (!data?.body?.nominee1Admno)
        throw new CustomError("Nominee 1 admission number is required")
    if (!data?.body?.nominee2Admno)
        throw new CustomError("Nominee 2 admission number is required")
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
        "SELECT * FROM candidates WHERE user_id = $1",
        [data.user.id]
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

        await client.query(
            "UPDATE elections SET total_candidates = total_candidates + 1 WHERE id = $1",
            [election.id]
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

export const getMyCandidate = async (userId) => {
    if (!userId) throw new CustomError("User id is required", 400)

    const res = await pool.query(
        "SELECT * FROM candidates WHERE user_id = $1",
        [userId]
    )

    if (res.rowCount === 0)
        throw new CustomError("No candidate application found", 404)

    return res.rows[0]
}
