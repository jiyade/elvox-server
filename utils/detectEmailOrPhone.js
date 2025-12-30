import CustomError from "./CustomError.js"

const detectInput = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^(\+91)?[0-9]{10}$/

    if (emailRegex.test(value)) return "email"
    if (phoneRegex.test(value)) return "phone"

    throw new CustomError("Invalid email or phone", 400)
}

export default detectInput
