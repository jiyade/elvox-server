import jwt from "jsonwebtoken"
import CustomError from "../utils/CustomError.js"
import pool from "../db/db.js"

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        const token =
            req.cookies?.token ||
            (authHeader?.startsWith("Bearer ") && authHeader.split(" ")[1])

        if (!token) throw new CustomError("Authentication required", 401)

        let payload

        try {
            payload = jwt.verify(token, process.env.JWT_SECRET)
        } catch (err) {
            throw new CustomError("Invalid or expired token", 401)
        }

        const view =
            payload.role.toLowerCase() === "student"
                ? "student_user_view"
                : "teacher_user_view"

        const result = await pool.query(
            `SELECT * FROM ${view} WHERE user_id = $1`,
            [payload.id]
        )

        if (result.rowCount === 0) throw new CustomError("User not found", 401)

        const { user_id: id, ...user } = result.rows[0]

        req.user = { id, ...user }
        req.auth = payload
        next()
    } catch (err) {
        next(err)
    }
}

export default authMiddleware
