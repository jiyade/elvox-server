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
    generateSecretKey,
    streamEvents
} from "../../controllers/electionController.js"
import { getLogs } from "../../controllers/logController.js"
import { publishResults } from "../../controllers/resultController.js"
import {
    getClassTieBreakerStatus,
    resolveTieBreaker
} from "../../controllers/tieBreakerController.js"
import requireRole from "../../middleware/requireRole.js"
import requirePassword from "../../middleware/requirePassword.js"
import resolveEffectiveRole from "../../middleware/resolveEffectiveRole.js"

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

router.patch("/:id/publish-result", requireRole(["admin"]), publishResults)

router.post("/:id/secret-key", requireRole(["admin"]), generateSecretKey)

router.get("/:id/logs", requireRole(["admin"]), getLogs)

router.get(
    "/:id/events/stream",
    resolveEffectiveRole,
    requireRole(["admin", "supervisor"]),
    streamEvents
)

router.get(
    "/:id/classes/:classId/tie-breaker",
    requireRole(["tutor"]),
    getClassTieBreakerStatus
)

router.post(
    "/:id/classes/:classId/tie-breaker/resolve",
    requireRole(["tutor"]),
    resolveTieBreaker
)

router.delete("/:id", requireRole(["admin"]), requirePassword, deleteElection)

router.patch("/:id", requireRole(["admin"]), updateElection)

router.get("/:id", getElectionDetails)

export default router
