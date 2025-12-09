import * as authService from "../services/authService.js"

export const getOtp = async (req, res, next) => {
    try {
        const data = await authService.getOtp(req.body)
        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const verifyOtp = async (req, res, next) => {
    try {
        const data = await authService.verifyOtp(req.body)
        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const signup = async (req, res, next) => {
    try {
        const { user, token } = await authService.signup(req.body)

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
        })

        res.status(201).json(user)
    } catch (err) {
        next(err)
    }
}

export const login = async (req, res, next) => {
    try {
        const { user, token } = await authService.login(req.body)

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        })

        res.status(200).json(user)
    } catch (err) {
        next(err)
    }
}

export const logout = (req, res) => {
    res.cookie("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        expires: new Date(0)
    })

    res.status(200).json({ message: "Logged out" })
}

export const verifyMe = async (req, res, next) => {
    if (!req.cookies.token)
        return res.status(401).json({ message: "Not logged in" })

    try {
        const { user } = await authService.verifyMe(req.cookies.token)
        res.status(200).json(user)
    } catch (err) {
        next(err)
    }
}
