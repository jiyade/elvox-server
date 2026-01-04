import { Router } from "express"
import {
    checkUserExists,
    getUser,
    updatePassword
} from "../controllers/userController.js"
import authMiddleware from "../middleware/auth.js"
import requireRole from "../middleware/requireRole.js"

const router = Router()

router.get("/exists", checkUserExists)
router.patch("/update-password", authMiddleware, updatePassword)
router.get("/:userId", authMiddleware, requireRole(["admin"]), getUser)

export default router
