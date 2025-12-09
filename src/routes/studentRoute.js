import { Router } from "express"
import { getStudent } from "../controllers/studentController.js"

const router = Router()

router.get("/:admno", getStudent)

export default router
