import { Router } from "express"
import upload from "../middleware/upload.js"
import {
    createAppeal,
    getAppeal,
    getAppeals,
    updateAppealStatus
} from "../controllers/appealController.js"
import requireRole from "../middleware/requireRole.js"

const router = Router()

router.get("/", getAppeals)
router.post(
    "/",
    requireRole(["student", "teacher"]),
    upload.array("attachments", 3),
    createAppeal
)
router.get("/:id", getAppeal)
router.patch("/:id", requireRole(["admin"]), updateAppealStatus)

export default router
