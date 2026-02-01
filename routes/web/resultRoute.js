import { Router } from "express"
import {
    getResults,
    getRandomCandidatesResults,
    exportResults
} from "../../controllers/resultController.js"

const router = new Router()

router.get("/random", getRandomCandidatesResults)
router.get("/:electionId/export", exportResults)
router.get("/:electionId", getResults)

export default router
