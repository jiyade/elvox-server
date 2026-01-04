import { Router } from "express"
import {
    getOtp,
    verifyOtpSignup,
    verifyOtpForgotPassword,
    signup,
    login,
    logout,
    resetPassword,
    verifyMe
} from "../controllers/authController.js"
import authMiddleware from "../middleware/auth.js"

const router = Router()

router.post("/otp", getOtp)
router.post("/otp/verify/signup", verifyOtpSignup)
router.post("/otp/verify/forgot-password", verifyOtpForgotPassword)

router.post("/signup", signup)
router.post("/login", login)
router.post("/logout", logout)

router.patch("/reset-password", resetPassword)
router.get("/me", authMiddleware, verifyMe)

export default router
