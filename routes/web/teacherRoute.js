import { Router } from "express"
import {
    checkTeacherExists,
    getTeacher
} from "../../controllers/teacherController.js"
import { getSupervisorEligibleTeachers } from "../../controllers/teacherController.js"
import requireRole from "../../middleware/requireRole.js"
import authMiddleware from "../../middleware/auth.js"

const router = Router()

router.get(
    "/supervisor-eligible/:electionId",
    authMiddleware,
    requireRole(["admin"]),
    getSupervisorEligibleTeachers
)
router.get("/exists/:empcode", checkTeacherExists)
router.get("/:empcode", getTeacher)

export default router
