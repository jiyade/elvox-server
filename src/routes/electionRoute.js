import { Router } from "express"
import { getElection, getElections } from "../controllers/electionController.js"

const router = Router()

router.get("/", getElections)
router.get("/:id", getElection)

export default router
