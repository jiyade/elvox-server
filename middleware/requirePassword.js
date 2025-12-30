import bcrypt from "bcrypt"
import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

const requirePassword = async (req, res, next) => {
    const { password } = req.body

    if (!password) throw new CustomError("Password is required", 400)

    const { rows } = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user.id]
    )

    if (!rows.length) throw new CustomError("User not found", 404)

    const { password_hash } = rows[0]

    const isMatch = await bcrypt.compare(password, password_hash)

    if (!isMatch) throw new CustomError("Invalid password", 401)

    next()
}

export default requirePassword
