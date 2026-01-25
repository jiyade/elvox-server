import { Router } from "express"
import { getBallotEntries } from "../../controllers/candidateController.js"

const router = Router()

router.get("/", getBallotEntries)

export default router
