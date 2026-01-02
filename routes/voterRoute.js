import { Router } from "express"
import { verifyVoter } from "../controllers/voterController.js"
import requireRole from "../middleware/requireRole.js"

const router = Router()

router.post("/verify", requireRole(["supervisor"]), verifyVoter)

export default router
