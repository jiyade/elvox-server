import { Router } from "express"
import {
    createElection,
    deleteElection,
    getAllElections,
    getElection,
    getElections,
    getSupervisors,
    updateSupervisors
} from "../controllers/electionController.js"
import requireRole from "../middleware/requireRole.js"
import requirePassword from "../middleware/requirePassword.js"

const router = Router()

router.get("/", getElections)
router.get("/all", getAllElections)
router.post("/", requireRole(["admin"]), createElection)
router.get("/supervisors", requireRole(["admin"]), getSupervisors)
router.post("/:id/supervisors", requireRole(["admin"]), updateSupervisors)
router.delete("/:id", requireRole(["admin"]), requirePassword, deleteElection)
router.get("/:id", getElection)

export default router
