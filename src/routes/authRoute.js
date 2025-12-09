import { Router } from "express"
import {
    getOtp,
    verifyOtp,
    signup,
    login,
    logout,
    verifyMe
} from "../controllers/authController.js"

const router = Router()

router.post("/otp", getOtp)
router.post("/otp/verify", verifyOtp)
router.post("/signup", signup)
router.post("/login", login)
router.post("/logout", logout)
router.get("/me", verifyMe)

export default router
