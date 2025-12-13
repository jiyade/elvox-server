import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const checkUserExists = async (data) => {
    const { role, id } = data

    if (!role) throw new CustomError("Role is required", 400)
    if (!id)
        throw new CustomError(
            "Admission number or employee code is required",
            400
        )

    let res

    if (role.toLowerCase() === "student") {
        res = await pool.query(
            "SELECT * FROM student_user_view WHERE admno = $1",
            [id]
        )
    } else if (role.toLowerCase() === "teacher") {
        res = await pool.query(
            "SELECT * FROM teacher_user_view WHERE empcode = $1",
            [id]
        )
    } else {
        throw new CustomError("Invalid role", 400)
    }

    if (res.rowCount === 0) return { exists: false }

    return { exists: true }
}
