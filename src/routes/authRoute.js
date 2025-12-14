import { Router } from "express"
import {
    getOtp,
    verifyOtpSignup,
    verifyOtpForgotPassword,
    signup,
    login,
    logout,
    verifyMe
} from "../controllers/authController.js"
import auth from "../middleware/auth.js"

const router = Router()

router.post("/otp", getOtp)
router.post("/otp/verify/signup", verifyOtpSignup)
router.post("/otp/verify/forgot-password", verifyOtpForgotPassword)
router.post("/signup", signup)
router.post("/login", login)
router.post("/logout", logout)
router.get("/me", auth, verifyMe)

export default router
