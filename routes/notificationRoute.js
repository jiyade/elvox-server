import { Router } from "express"
import {
    getNotifications,
    markNotificationRead
} from "../controllers/notificationController.js"

const router = new Router()

router.get("/", getNotifications)
router.patch("/:id/read", markNotificationRead)

export default router
