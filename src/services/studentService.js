import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import maskContact from "../utils/maskContact.js"

export const getStudent = async (admno, mask = true) => {
    if (!admno) throw new CustomError("Admission number is required", 400)

    const res = await pool.query("SELECT * FROM students WHERE admno=$1", [
        admno
    ])

    if (res.rowCount === 0) throw new CustomError("Student not found", 404)

    if (!mask) return res.rows[0]

    const student = {
        ...res.rows[0],
        phone: maskContact(res.rows[0].phone, "phone"),
        email: maskContact(res.rows[0].email, "email")
    }

    return student
}

export const checkStudentExists = async (data) => {
    const { admno } = data

    if (!admno) throw new CustomError("Admission number is required", 400)

    const res = await pool.query(
        "SELECT 1 FROM students WHERE admno = $1 LIMIT 1",
        [admno]
    )

    if (res.rowCount === 0) return { exists: false }

    return { exists: true }
}
