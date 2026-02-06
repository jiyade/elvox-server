import { Router } from "express"
import {
    getElection,
    activateVotingSystem,
    streamRevokeEvents
} from "../../controllers/electionController.js"
import { castVote } from "../../controllers/voteController.js"
import desktopAuthMiddleware from "../../middleware/desktopAuth.js"

const router = Router()

router.get("/", getElection)
router.get("/:id/sse/revoke", desktopAuthMiddleware, streamRevokeEvents)
router.post("/:id/vote", desktopAuthMiddleware, castVote)
router.post("/:id/secret-key/verify", activateVotingSystem)

export default router
