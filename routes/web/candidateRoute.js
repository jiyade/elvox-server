import { Router } from "express"
import requireRole from "../../middleware/requireRole.js"
import requirePassword from "../../middleware/requirePassword.js"
import {
    checkCandidateExists,
    createCandidate,
    getCandidate,
    getCandidates,
    getMyCandidate,
    withdrawCandidate,
    reviewCandidate,
    getPendingCandidates
} from "../../controllers/candidateController.js"
import upload from "../../middleware/upload.js"

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
router.get("/", getCandidates)
router.get("/pending", requireRole(["tutor"]), getPendingCandidates)
router.get("/me", requireRole(["student"]), getMyCandidate)
router.patch(
    "/:id/withdraw",
    requireRole(["student"]),
    requirePassword,
    withdrawCandidate
)
router.patch("/:id/status", requireRole(["tutor"]), reviewCandidate)
router.get("/exists/:id", checkCandidateExists)
router.get("/:id", requireRole(["teacher", "admin"]), getCandidate)

export default router
