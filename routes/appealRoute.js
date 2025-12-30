import { Router } from "express"
import upload from "../middleware/upload.js"
import { createAppeal, getAppeals } from "../controllers/appealController.js"
import requireRole from "../middleware/requireRole.js"

const router = Router()

router.get("/", getAppeals)
router.post(
    "/",
    requireRole(["student", "teacher", "supervisor"]),
    upload.array("attachments", 3),
    createAppeal
)

export default router
