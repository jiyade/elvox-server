import { Router } from "express"
import {
    getAllElections,
    getElection,
    getElections,
    getSupervisors,
    updateSupervisors
} from "../controllers/electionController.js"
import requireRole from "../middleware/requireRole.js"

const router = Router()

router.get("/", getElections)
router.get("/all", getAllElections)
router.get("/supervisors", requireRole(["admin"]), getSupervisors)
router.get("/:id/supervisors", requireRole(["admin"]), updateSupervisors)
router.get("/:id", getElection)

export default router
