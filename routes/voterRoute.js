import { Router } from "express"
import { verifyVoter } from "../controllers/voterController.js"
import requireRole from "../middleware/requireRole.js"
import resolveEffectiveRole from "../middleware/resolveEffectiveRole.js"

const router = Router()

router.post(
    "/verify",
    resolveEffectiveRole,
    requireRole(["supervisor"]),
    verifyVoter
)

export default router
