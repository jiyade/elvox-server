import { Router } from "express"
import { checkUserExists } from "../controllers/userController.js"

const router = Router()

router.get("/exists", checkUserExists)

export default router
