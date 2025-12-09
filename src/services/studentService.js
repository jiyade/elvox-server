import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const getStudent = async (admno) => {
    if (!admno) throw new CustomError("Admission number is required", 400)

    const res = await pool.query("SELECT * FROM students WHERE admno=$1", [
        admno
    ])

    if (res.rowCount === 0) throw new CustomError("Student not found", 404)

    return res.rows[0]
}
