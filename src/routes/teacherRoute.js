import { Router } from "express"
import { getTeacher } from "../controllers/teacherController.js"

const router = Router()

router.get("/:empcode", getTeacher)

export default router
