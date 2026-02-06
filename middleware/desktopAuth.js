import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"
import { hashToken } from "../utils/deviceToken.js"

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        const headerToken = authHeader?.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : null

        const queryToken = req.query.token

        const token = headerToken || queryToken

        if (!token) throw new CustomError("Authentication required", 401)

        const hashedToken = hashToken(token)

        const verifyRes = await pool.query(
            "SELECT device_id, device_name, election_id, revoked_at FROM voting_devices WHERE auth_token_hash = $1",
            [hashedToken]
        )

        if (verifyRes.rowCount === 0)
            throw new CustomError("Authentication required", 401)

        const {
            device_id: deviceId,
            device_name: deviceName,
            election_id: electionId,
            revoked_at: revokedAt
        } = verifyRes.rows[0]

        if (revokedAt) {
            throw new CustomError(
                "This voting system has been revoked by admin",
                403,
                "DEVICE_REVOKED"
            )
        }

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
