import express from "express"
import { getClasses } from "../controllers/classController.js"

const router = express.Router()

router.get("/", getClasses)

export default router
