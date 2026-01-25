import crypto from "crypto"
import jwt from "jsonwebtoken"
import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"
import { checkStudentExists } from "./studentService.js"
import { getElectionDetails } from "./electionService.js"
import capitalize from "../utils/capitalize.js"
import { createLog } from "./logService.js"
import { emitEvent } from "../utils/sseManager.js"

export const verifyVoter = async (user, data) => {
    const { admno, electionId } = data

    if (!admno) throw new CustomError("Admission number is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)
    if (!user.id) throw new CustomError("Supervisor id is required", 400)

    const election = await getElectionDetails(electionId)

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
            [admno, electionId, user.id]
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

        await createLog(
            election.id,
            {
                level: "info",
                message: `Voter verified for election "${
                    election.name
                }" by ${capitalize(user?.effectiveRole ?? user.role)} ${user.name} (id: ${user.id})`
            },
            client
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

export const authenticateVoter = async (data) => {
    const { admno, otp, electionId } = data

    if (!admno) throw new CustomError("Admission number is required", 400)
    if (!otp) throw new CustomError("OTP is required", 400)
    if (!electionId) throw new CustomError("Election id is required", 400)

    const election = await getElectionDetails(electionId)

    if (election.status !== "voting")
        throw new CustomError(
            "Voting is unavailable. The election is not in the voting phase",
            409
        )

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const voterRes = await client.query(
            "SELECT has_voted FROM voters WHERE admno = $1 AND election_id = $2",
            [admno, electionId]
        )

        if (voterRes.rowCount === 0)
            throw new CustomError("Voter record not found", 404)

        if (voterRes.rows[0].has_voted)
            throw new CustomError("You have already voted", 409)

        const otpRes = await client.query(
            "SELECT otp_hash, expires_at FROM otp_verifications WHERE admno = $1 AND election_id = $2 AND used_at IS NULL FOR UPDATE",
            [admno, electionId]
        )

        if (otpRes.rowCount === 0) throw new CustomError("OTP not found", 404)

        const { otp_hash, expires_at } = otpRes.rows[0]

        if (new Date() > expires_at)
            throw new CustomError("OTP has expired", 400)

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex")

        const isValid = crypto.timingSafeEqual(
            Buffer.from(hashedOtp, "hex"),
            Buffer.from(otp_hash, "hex")
        )

        if (!isValid) throw new CustomError("Invalid OTP", 400)

        const classRes = await client.query(
            "SELECT class_id FROM students WHERE admno = $1",
            [admno]
        )

        if (classRes.rowCount === 0)
            throw new CustomError("Student record not found", 404)

        const classId = classRes.rows[0].class_id

        const votingToken = jwt.sign(
            {
                admno,
                electionId,
                deviceId: data.device.deviceId,
                scope: "voting"
            },
            process.env.VOTING_TOKEN_SECRET,
            { expiresIn: "2m" }
        )

        await client.query(
            "UPDATE otp_verifications SET used_at = NOW() WHERE admno = $1 AND election_id = $2",
            [admno, electionId]
        )

        await client.query("COMMIT")

        emitEvent(electionId, {
            type: "otp-used",
            admno
        })

        return {
            classId,
            votingToken
        }
    } catch (err) {
        await client.query("ROLLBACK")

        throw err
    } finally {
        client.release()
    }
}
