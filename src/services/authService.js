import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import CustomError from "../utils/CustomError.js"
import detectInput from "../utils/detectEmailOrPhone.js"
import pool from "../db/db.js"
import otps from "../utils/otpStore.js"
import capitalize from "../utils/capitalize.js"
import validateSignUpInput from "../utils/validateSignUpInput.js"
import { getStudent } from "./studentService.js"
import { getTeacher } from "./teacherService.js"

export const getOtp = async (data) => {
    if (!data.otpMethod) throw new CustomError("OTP method required", 400)
    if (!data[data.otpMethod])
        throw new CustomError(`${capitalize(data.otpMethod)} needed`)

    const type = detectInput(data[data.otpMethod])

    if (type === "email") {
        const otp = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes

        otps.set(data[data.otpMethod], { otp, expiresAt })

        const emailData = {
            sender: {
                email: process.env.BREVO_SENDER_EMAIL,
                name: process.env.BREVO_SENDER_NAME
            },
            to: [{ email: data.email }],
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

        return { message: "OTP send" }
    } else if (type === "phone") {
    }
}

export const verifyOtp = async (data) => {
    const { role, admno, empcode, otpMethod, otp, email, phone } = data

    if (!otpMethod) throw new CustomError("OTP method required", 400)

    if (!otp) throw new CustomError("OTP required", 400)

    if (otpMethod === "phone" && !phone)
        throw new CustomError("Phone is required", 400)

    if (otpMethod === "email" && !email)
        throw new CustomError("Email is required", 400)

    if (!role) throw new CustomError("Role is required", 400)

    let person

    if (role.toLowerCase() === "student") {
        if (!admno) throw new CustomError("Admission number is required", 400)

        person = await getStudent(admno)
    }

    if (role.toLowerCase() === "teacher") {
        if (!empcode) throw new CustomError("Employee code is required", 400)

        person = await getTeacher(empcode)
    }

    if (person.email !== email) throw new CustomError("Invalid user details")

    // ONLY FOR TESTING ONLY, MUST REMOVE IN PROD
    if (data.otp === "123456") {
        const signupToken = jwt.sign(
            { role, admno, empcode },
            process.env.SIGNUP_SECRET,
            { expiresIn: "10m" }
        )
        return { message: "OTP verified", signupToken }
    }
    // ----------------------------------------

    const record = otps.get(data[otpMethod])

    if (!record) throw new CustomError("No OTP found", 400)

    if (record.expiresAt < Date.now()) {
        otps.delete(data[otpMethod])
        throw new CustomError("OTP expired", 400)
    }
    if (record.otp !== otp) throw new CustomError("Invalid OTP", 400)

    otps.delete(data[otpMethod])

    const signupToken = jwt.sign(
        { role, admno, empcode },
        process.env.SIGNUP_SECRET,
        { expiresIn: "10m" }
    )

    return { message: "OTP verified", signupToken }
}

export const signup = async (data) => {
    const { role, admno, empcode, password } = validateSignUpInput(data)

    let person

    if (role.toLowerCase() === "student") {
        person = await getStudent(admno)
    }

    if (role.toLowerCase() === "teacher") {
        person = await getTeacher(admno)
    }

    const {
        name,
        department,
        class: studentClass,
        semester,
        batch,
        profile_pic,
        phone,
        gender
    } = person

    if (!person.email || !person.phone)
        throw new CustomError("No email or phone for this record", 400)

    const email = person.email.trim().toLowerCase()

    const existing = await pool.query(
        "SELECT * FROM users WHERE email=$1 OR admno=$2 OR empcode=$3",
        [email, admno || null, empcode || null]
    )

    if (existing.rowCount > 0)
        throw new CustomError("An account already exists for this user", 409)

    const passwordHash = await bcrypt.hash(password, 10)

    const insertResult = await pool.query(
        "INSERT INTO users (email, password_hash, role, admno, empcode, name, department, class, semester, batch, profile_pic, phone, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, email, role, admno, empcode, name, department, class, semester, batch, profile_pic, phone, gender",
        [
            email,
            passwordHash,
            role,
            admno,
            empcode,
            name,
            department,
            studentClass,
            semester,
            batch,
            profile_pic,
            phone,
            gender
        ]
    )

    const user = insertResult.rows[0]

    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set in environment")
    }

    const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    )

    return { user, token }
}

export const login = async (data) => {
    const { eop, password } = data

    if (!eop) throw new CustomError("Email or phone required", 400)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^(\+91)?[0-9]{10}$/

    const type = detectInput(eop)

    if (!password) throw new CustomError("Password is required", 400)

    const res = await pool.query(`SELECT * FROM users WHERE ${type}=$1`, [eop])

    if (res.rowCount === 0) throw new CustomError("Invalid credentials", 401)

    const { password_hash, created_at, ...user } = res.rows[0]

    const isMatch = await bcrypt.compare(password, password_hash)

    if (!isMatch) throw new CustomError("Invalid credentials", 401)

    const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    )

    return {
        user,
        token
    }
}

export const verifyMe = async (token) => {
    let payload

    try {
        payload = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
        throw new CustomError("Invalid or expired token", 401)
    }

    const res = await pool.query("SELECT * FROM users WHERE id=$1", [
        payload.id
    ])

    if (res.rowCount === 0) throw new CustomError("User not found", 404)

    const { password_hash, created_at, ...user } = res.rows[0]

    return { user }
}
