import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import CustomError from "../utils/CustomError.js"
import detectInput from "../utils/detectEmailOrPhone.js"
import pool from "../db/db.js"
import otps from "../utils/otpStore.js"
import capitalize from "../utils/capitalize.js"
import { getStudent } from "./studentService.js"
import { getTeacher } from "./teacherService.js"
import validateSignUpInput from "../utils/validateSignUpInput.js"
import maskContact from "../utils/maskContact.js"

export const getOtp = async (data) => {
    if (!data.purpose) throw new CustomError("Purpose is required", 400)
    if (!data.otpMethod) throw new CustomError("OTP method required", 400)
    if (data.otpMethod !== "email" && data.otpMethod !== "phone")
        throw new CustomError("Invalid otp method", 400)

    const type = data.otpMethod === "email" ? "email" : "phone"

    let contactInfo, exists

    if (data.purpose === "signup") {
        if (!data.role) throw new CustomError("Role is required", 400)
        if (data.role !== "student" && data.role !== "teacher")
            throw new CustomError("Invalid role", 400)

        let res

        if (data.role === "student") {
            if (!data.admno)
                throw new CustomError("Admission number is required", 400)
            res = await pool.query(
                `SELECT ${type} FROM students WHERE admno = $1`,
                [data.admno]
            )
        }

        if (data.role === "teacher") {
            if (!data.empcode)
                throw new CustomError("Employee code is required", 400)
            res = await pool.query(
                `SELECT ${type} FROM teachers WHERE empcode = $1`,
                [data.empcode]
            )
        }

        exists = res.rowCount > 0 || res.rowCount > 0
        contactInfo = res.rows[0][type]
    } else if (data.purpose === "forgot") {
        if (!data[type])
            throw new CustomError(`${capitalize(data.otpMethod)} required`, 400)

        const user = await pool.query(
            `SELECT 1 FROM users WHERE ${type} = $1 LIMIT 1`,
            [data[data.otpMethod]]
        )

        exists = user.rowCount > 0
        contactInfo = type === "email" ? data.email : data.phone
    } else {
        throw new CustomError("Invalid purpose", 400)
    }

    if (exists) {
        if (type === "email") {
            const otp = Math.floor(100000 + Math.random() * 900000).toString()
            const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes

            otps.set(data[data.otpMethod], { otp, expiresAt })

            const emailData = {
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME
                },
                to: [{ email: contactInfo }],
                subject: "Your OTP for Elvox",
                textContent: `Your OTP for Elvox is ${otp}. It expires in 5 minutes.`
            }

            const res = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.BREVO_API_KEY
                },
                body: JSON.stringify(emailData)
            })

            if (!res.ok) {
                throw new CustomError("Failed to send OTP email", 500)
            }
        } else if (type === "phone") {
        }
    }

    return { message: "OTP sent", contact: maskContact(contactInfo, type) }
}

export const verifyOtpSignup = async (data) => {
    const { role, admno, empcode, otpMethod, otp } = data

    if (!otpMethod) throw new CustomError("OTP method required", 400)

    if (otpMethod !== "email" && otpMethod !== "phone")
        throw new CustomError("Invalid otp method", 400)

    if (!otp) throw new CustomError("OTP required", 400)

    if (!role) throw new CustomError("Role is required", 400)

    const record = otps.get(data[otpMethod])

    if (!record) throw new CustomError("No OTP found", 400)

    if (record.expiresAt < Date.now()) {
        otps.delete(data[otpMethod])
        throw new CustomError("OTP expired", 400)
    }
    if (record.otp !== otp) throw new CustomError("Invalid OTP", 400)

    otps.delete(data[otpMethod])

    const signupToken = jwt.sign(
        { role, admno, empcode, purpose: "signup" },
        process.env.SIGNUP_SECRET,
        { expiresIn: "5m" }
    )

    return { message: "OTP verified", signupToken }
}

export const verifyOtpForgotPassword = async (data) => {
    const { otpMethod, otp, email, phone } = data

    if (!otpMethod) throw new CustomError("OTP method required", 400)

    if (otpMethod !== "email" && otpMethod !== "phone")
        throw new CustomError("Invalid otp method", 400)

    if (!otp) throw new CustomError("OTP required", 400)

    const type = otpMethod === "email" ? "email" : "phone"

    if (otpMethod === "phone" && !phone)
        throw new CustomError("Phone is required", 400)

    if (otpMethod === "email" && !email)
        throw new CustomError("Email is required", 400)

    const res = await pool.query(`SELECT * FROM users WHERE ${type} = $1`, [
        data[otpMethod].toLowerCase().trim()
    ])

    if (res.rowCount === 0) throw new CustomError("User does not exist", 404)

    const user = res.rows[0]

    const record = otps.get(data[otpMethod])

    if (!record) throw new CustomError("No OTP found", 400)

    if (record.expiresAt < Date.now()) {
        otps.delete(data[otpMethod])
        throw new CustomError("OTP expired", 400)
    }
    if (record.otp !== otp) throw new CustomError("Invalid OTP", 400)

    otps.delete(data[otpMethod])

    const passwordResetToken = jwt.sign(
        {
            id: user.id,
            purpose: "password_reset"
        },
        process.env.PASSWORD_CHANGE_SECRET,
        { expiresIn: "5m" }
    )
    return { message: "OTP verified", passwordResetToken }
}

export const signup = async (data) => {
    const { role, admno, empcode, password } = validateSignUpInput(data)

    let person

    if (role.toLowerCase() === "student") {
        person = await getStudent(admno, false)
    } else if (role.toLowerCase() === "teacher") {
        person = await getTeacher(empcode, false)
    }

    const { name, profile_pic, user_id } = person

    if (!person.email || !person.phone)
        throw new CustomError("No email or phone for this record", 400)

    const email = person.email.trim().toLowerCase()
    const phone = person.phone.trim()

    const existing = await pool.query("SELECT * FROM users WHERE id = $1", [
        user_id
    ])

    if (existing.rowCount > 0)
        throw new CustomError("An account already exists for this user", 409)

    const passwordHash = await bcrypt.hash(password, 10)

    const insertResult = await pool.query(
        "INSERT INTO users (email, password_hash, role, name, profile_pic, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, role",
        [email, passwordHash, role, name, profile_pic, phone]
    )

    if (insertResult.rows[0].role.toLowerCase() === "student") {
        await pool.query("UPDATE students SET user_id = $1 WHERE admno = $2", [
            insertResult.rows[0].id,
            person.admno
        ])
    } else if (insertResult.rows[0].role.toLowerCase() === "teacher") {
        await pool.query(
            "UPDATE teachers SET user_id = $1 WHERE empcode = $2",
            [insertResult.rows[0].id, person.empcode]
        )
    }

    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set in environment")
    }

    let userDeatils

    if (insertResult.rows[0].role.toLowerCase() === "student") {
        const res = await pool.query(
            "SELECT * FROM student_user_view WHERE user_id = $1",
            [insertResult.rows[0].id]
        )

        if (res.rowCount === 0) throw new CustomError("User not found", 404)

        userDeatils = res.rows[0]
    } else if (insertResult.rows[0].role.toLowerCase() === "teacher") {
        const res = await pool.query(
            "SELECT * FROM teacher_user_view WHERE user_id = $1",
            [insertResult.rows[0].id]
        )

        if (res.rowCount === 0) throw new CustomError("User not found", 404)

        userDeatils = res.rows[0]
    }

    const token = jwt.sign(
        { id: userDeatils.user_id, role: userDeatils.role },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    )

    const { user_id: id, ...rest } = userDeatils

    return { user: { id, ...rest }, token }
}

export const login = async (data) => {
    const { eop, password } = data

    if (!eop) throw new CustomError("Email or phone required", 400)

    const type = detectInput(eop)

    if (!password) throw new CustomError("Password is required", 400)

    const res = await pool.query(`SELECT * FROM users WHERE ${type} = $1`, [
        type === "email" ? eop.trim().toLowerCase() : eop.trim()
    ])

    if (res.rowCount === 0) throw new CustomError("Invalid credentials", 401)

    const { password_hash, created_at, ...user } = res.rows[0]

    const isMatch = await bcrypt.compare(password, password_hash)

    if (!isMatch) throw new CustomError("Invalid credentials", 401)

    let userDeatils

    if (user.role.toLowerCase() === "student") {
        const result = await pool.query(
            "SELECT * FROM student_user_view WHERE user_id = $1",
            [user.id]
        )

        if (result.rowCount === 0) throw new CustomError("User not found", 404)

        userDeatils = result.rows[0]
    } else if (
        user.role.toLowerCase() === "admin" ||
        user.role.toLowerCase() === "teacher" ||
        user.role.toLowerCase() === "supervisor"
    ) {
        const result = await pool.query(
            "SELECT * FROM teacher_user_view WHERE user_id = $1",
            [user.id]
        )

        if (result.rowCount === 0) throw new CustomError("User not found", 404)

        userDeatils = result.rows[0]
    } else {
        throw new CustomError("Invalid role", 400)
    }

    const token = jwt.sign(
        { id: userDeatils.user_id, role: userDeatils.role },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    )

    const { user_id: id, ...rest } = userDeatils

    return { user: { id, ...rest }, token }
}

export const resetPassword = async (data) => {
    const { newPassword, confirmNewPassword, passwordResetToken } = data

    const passwordRegex =
        /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*\-]).{8,}$/

    if (!passwordResetToken)
        throw new CustomError("Password reset token is required", 401)

    if (!newPassword || !confirmNewPassword)
        throw new CustomError(
            "New password and confirm new password is required",
            400
        )

    if (!passwordRegex.test(newPassword))
        throw new CustomError(
            "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character",
            400
        )

    if (newPassword !== confirmNewPassword)
        throw new CustomError("Passwords do not match", 400)

    let payload

    try {
        payload = jwt.verify(
            passwordResetToken,
            process.env.PASSWORD_CHANGE_SECRET
        )
    } catch (_) {
        throw new CustomError("Invalid or expired password reset token", 401)
    }

    if (payload.purpose !== "password_reset" || !payload.id)
        throw new CustomError("Invalid token", 401)

    const passwordHash = await bcrypt.hash(newPassword, 10)

    const res = await pool.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        [passwordHash, payload.id]
    )

    if (res.rowCount === 0) throw new CustomError("User not found", 404)

    return { message: "Password reset successfully" }
}

export const checkIfSupervisor = async (userId, userRole, electionId) => {
    let effectiveRole = userRole
    let isSupervisor = false

    if (electionId && userRole === "teacher") {
        const res = await pool.query(
            `
      SELECT 1
      FROM supervisors
      WHERE election_id = $1
        AND user_id = $2
      `,
            [electionId, userId]
        )

        if (res.rowCount > 0) {
            effectiveRole = "supervisor"
            isSupervisor = true
        }
    }

    return {
        isSupervisor,
        effectiveRole
    }
}
