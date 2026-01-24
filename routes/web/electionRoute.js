import { Router } from "express"
import {
    createElection,
    deleteElection,
    updateElection,
    getAllElections,
    getElection,
    getElectionDetails,
    getSupervisors,
    getReservedClasses,
    updateReservedClasses,
    updateSupervisors,
    updateAutoPublishResults,
    generateSecretKey
} from "../../controllers/electionController.js"
import requireRole from "../../middleware/requireRole.js"
import requirePassword from "../../middleware/requirePassword.js"

const router = Router()

router.get("/", getElection)
router.get("/all", getAllElections)
router.post("/", requireRole(["admin"]), createElection)
router.get("/:id/supervisors", requireRole(["admin"]), getSupervisors)
router.post("/:id/supervisors", requireRole(["admin"]), updateSupervisors)
router.get(
    "/:id/category-config",
    requireRole(["admin", "student"]),
    getReservedClasses
)
router.patch(
    "/:id/category-config",
    requireRole(["admin"]),
    updateReservedClasses
)
router.patch(
    "/:id/auto-publish",
    requireRole(["admin"]),
    updateAutoPublishResults
)
router.post("/:id/secret-key", requireRole(["admin"]), generateSecretKey)
router.delete("/:id", requireRole(["admin"]), requirePassword, deleteElection)
router.patch("/:id", requireRole(["admin"]), updateElection)
router.get("/:id", getElectionDetails)

export default router
