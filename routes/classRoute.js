import express from "express"
import { getClass, getClasses } from "../controllers/classController.js"

const router = express.Router()

router.get("/", getClasses)
router.get("/:id", getClass)

export default router
