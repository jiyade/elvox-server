import { Router } from "express"
import {
    checkTeacherExists,
    getTeacher
} from "../controllers/teacherController.js"

const router = Router()

router.get("/exists/:empcode", checkTeacherExists)
router.get("/:empcode", getTeacher)

export default router
