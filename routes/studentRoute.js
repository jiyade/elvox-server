import { Router } from "express"
import {
    checkStudentExists,
    getStudent
} from "../controllers/studentController.js"

const router = Router()

router.get("/exists/:admno", checkStudentExists)
router.get("/:admno", getStudent)

export default router
