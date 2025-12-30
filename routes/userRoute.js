import { Router } from "express"
import {
    checkUserExists,
    updatePassword
} from "../controllers/userController.js"
import auth from "../middleware/auth.js"

const router = Router()

router.get("/exists", checkUserExists)
router.patch("/update-password", auth, updatePassword)

export default router
