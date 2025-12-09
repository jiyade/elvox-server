import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const checkUserExists = async (data) => {
    const { role, id } = data
    let field

    if (!role) throw new CustomError("Role is required", 400)
    if (!id)
        throw new CustomError(
            "Admission number or employee code is required",
            400
        )

    if (role === "student") field = "admno"
    else if (role === "teacher") field = "empcode"
    else throw new CustomError("Invalid role", 400)

    const res = await pool.query(`SELECT * FROM users WHERE ${field}=$1`, [id])

    if (res.rowCount === 0) return { exists: false }

    return { exists: true }
}
