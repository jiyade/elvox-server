import jwt from "jsonwebtoken"
import CustomError from "./CustomError.js"

const validateSignUpInput = (data) => {
    const { password, confirmPassword, signupToken } = data

    const passwordRegex =
        /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*\-]).{8,}$/

    if (!signupToken) throw new CustomError("Signup token missing", 401)

    let payload

    try {
        payload = jwt.verify(signupToken, process.env.SIGNUP_SECRET)
    } catch (_) {
        throw new CustomError("Invalid or expired signup token", 401)
    }

    if (payload.purpose !== "signup")
        throw new CustomError("Invalid token", 401)

    const { role, admno, empcode } = payload

    if (!role) throw new CustomError("Role is required", 400)

    const allowedRoles = ["student", "teacher"]

    if (!allowedRoles.includes(role.toLowerCase())) {
        throw new CustomError("Invalid role", 400)
    }

    if (role.toLowerCase() === "student" && !admno) {
        throw new CustomError("Admission number is required", 400)
    }

    if (role.toLowerCase() === "teacher" && !empcode) {
        throw new CustomError("Employee code is required", 400)
    }

    if (!password || !confirmPassword) {
        throw new CustomError("Password and confirm password are required", 400)
    }

    if (!passwordRegex.test(password)) {
        throw new CustomError(
            "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character",
            400
        )
    }

    if (password !== confirmPassword) {
        throw new CustomError("Passwords do not match", 400)
    }

    return {
        role: role.toLowerCase(),
        admno,
        empcode,
        password
    }
}

export default validateSignUpInput
