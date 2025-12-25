import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const getClasses = async () => {
    const res = await pool.query("SELECT * FROM classes")

    if (res.rowCount === 0) throw new CustomError("No classes found", 404)

    const classes = res.rows

    return classes
}

export const getClass = async (classId) => {
    const res = await pool.query("SELECT * FROM classes WHERE id = $1", [
        classId
    ])

    if (res.rowCount === 0) throw new CustomError("No class found", 404)

    return res.rows
}
