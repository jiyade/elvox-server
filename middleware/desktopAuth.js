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
            `
            SELECT vd.device_id, vd.device_name, vd.election_id, vd.revoked_at
            FROM voting_devices vd
            JOIN elections e ON e.election_id = vd.election_id
            WHERE vd.auth_token_hash = $1
            AND e.status != 'closed';
            `,
            [hashedToken]
        )

        if (verifyRes.rowCount !== 1)
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
