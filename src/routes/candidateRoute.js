import { Router } from "express"
import requireRole from "../middleware/requireRole.js"
import {
    createCandidate,
    getCandidate,
    getMyCandidate
} from "../controllers/candidateController.js"
import upload from "../middleware/upload.js"

const router = Router()

router.post(
    "/",
    requireRole(["student"]),
    upload.fields([
        { name: "signature", maxCount: 1 },
        { name: "nominee1Proof", maxCount: 1 },
        { name: "nominee2Proof", maxCount: 1 }
    ]),
    createCandidate
)
router.get("/me", requireRole(["student"]), getMyCandidate)
router.get(
    "/:id",
    requireRole(["teacher", "supervisor", "admin"]),
    getCandidate
)

export default router
