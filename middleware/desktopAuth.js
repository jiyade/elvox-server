import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"
import { hashToken } from "../utils/deviceToken.js"

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader?.startsWith("Bearer "))
            throw new CustomError("Authentication required", 401)

        const token = authHeader.split(" ")[1]

        if (!token) throw new CustomError("Authentication required", 401)

        const hashedToken = hashToken(token)

        const verifyRes = await pool.query(
            "SELECT device_id, device_name, election_id FROM voting_devices WHERE auth_token_hash = $1 AND revoked_at IS NULL",
            [hashedToken]
        )

        if (verifyRes.rowCount === 0)
            throw new CustomError("Authentication required", 401)

        const {
            device_id: deviceId,
            device_name: deviceName,
            election_id: electionId
        } = verifyRes.rows[0]

        req.device = {
            deviceId,
            deviceName,
            electionId
        }

        next()
    } catch (err) {
        next(err)
    }
}

export default authMiddleware
