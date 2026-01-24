import { Router } from "express"
import { authenticateVoter } from "../../controllers/voterController.js"

const router = Router()

router.patch("/authenticate", authenticateVoter)

export default router
