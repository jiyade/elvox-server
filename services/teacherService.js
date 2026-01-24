import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import maskContact from "../utils/maskContact.js"

export const getTeacher = async (empcode, mask = true) => {
    if (!empcode) throw new CustomError("Employee code is required", 400)

    const res = await pool.query("SELECT * FROM teachers WHERE empcode=$1", [
        empcode
    ])

    if (res.rowCount === 0) throw new CustomError("Teacher not found", 404)

    if (!mask) return res.rows[0]

    const teacher = {
        ...res.rows[0],
        phone: maskContact(res.rows[0].phone, "phone"),
        email: maskContact(res.rows[0].email, "email")
    }

    return teacher
}

export const checkTeacherExists = async (data) => {
    const { empcode } = data
    if (!empcode) throw new CustomError("Employee code is required", 400)

    const res = await pool.query(
        "SELECT 1 FROM teachers WHERE empcode = $1 LIMIT 1",
        [empcode]
    )

    if (res.rowCount === 0) return { exists: false }

    return { exists: true }
}

export const getSupervisorEligibleTeachers = async (electionId) => {
    const res = await pool.query(
        "SELECT u.id, u.profile_pic, t.name, t.empcode, t.department FROM users u JOIN teachers t ON u.id = t.user_id WHERE u.role = 'teacher' AND NOT EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = u.id AND s.election_id = $1)",
        [electionId]
    )

    return res.rows
}
