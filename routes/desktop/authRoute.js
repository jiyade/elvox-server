import { Router } from "express"
import authMiddleware from "../../middleware/desktopAuth.js"

const router = new Router()

router.get("/", authMiddleware, (req, res) => {
    res.status(200).json(req.device)
})

export default router
