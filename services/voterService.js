import crypto from "crypto"
import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"
import { checkStudentExists } from "./studentService.js"
import { getElection } from "./electionService.js"

export const verifyVoter = async (data) => {
    const { admno, electionId, userId } = data

    if (!admno) throw new CustomError("Admission number is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!userId) throw new CustomError("Supervisor id is required", 400)

    const election = await getElection(electionId)

    if (election.status !== "voting")
        throw new CustomError(
            "Voter verification is unavailable. The election is not in the voting phase",
            409
        )

    const studentExists = await checkStudentExists({ admno })

    if (!studentExists.exists)
        throw new CustomError("Invalid admission number", 400)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        // INSERT INTO VOTERS, IF EXISTS DO NOTHING
        const voterRes = await client.query(
            "INSERT INTO voters (admno, election_id, verified_by) VALUES ($1, $2, $3) ON CONFLICT (admno, election_id) DO NOTHING RETURNING *",
            [admno, electionId, userId]
        )

        // IF VOTER ROW EXISTS, CHECK IF ALREADY VOTED
        if (voterRes.rowCount === 0) {
            const { rows } = await client.query(
                "SELECT has_voted FROM voters WHERE admno = $1 AND election_id = $2",
                [admno, electionId]
            )

            if (!rows.length) {
                throw new CustomError("Voter record not found.", 500)
            }

            if (rows[0].has_voted)
                throw new CustomError("This voter has already voted.", 409)
        }

        // DELETE OTP ROW IF EXISTS
        await client.query(
            "DELETE FROM otp_verifications WHERE admno = $1 AND election_id = $2",
            [admno, electionId]
        )

        const otp = Math.floor(100000 + Math.random() * 900000).toString()

        const otpHash = crypto.createHash("sha256").update(otp).digest("hex")

        const expiresAt = new Date(Date.now() + 60 * 1000)

        const otpRes = await client.query(
            "INSERT INTO otp_verifications (admno, election_id, otp_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING created_at",
            [admno, electionId, otpHash, expiresAt]
        )

        await client.query("COMMIT")

        return {
            admno,
            electionId,
            otp,
            expiresAt,
            issuedAt: otpRes.rows[0].created_at
        }
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }
}
