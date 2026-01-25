import express from "express"
import "dotenv/config"
import cors from "cors"
import cookieParser from "cookie-parser"
import pool from "./db/db.js"

// MIDDLEWARE IMPORTS
import errorHandler from "./middleware/errorHandler.js"
import notFound from "./middleware/notFound.js"
import authMiddleware from "./middleware/auth.js"
import desktopAuthMiddleware from "./middleware/desktopAuth.js"

// WEB ROUTERS IMPORT
import authRouter from "./routes/web/authRoute.js"
import studentRouter from "./routes/web/studentRoute.js"
import teacherRouter from "./routes/web/teacherRoute.js"
import userRouter from "./routes/web/userRoute.js"
import classRouter from "./routes/web/classRoute.js"
import electionRouter from "./routes/web/electionRoute.js"
import candidateRouter from "./routes/web/candidateRoute.js"
import notificationRouter from "./routes/web/notificationRoute.js"
import appealRouter from "./routes/web/appealRoute.js"
import resultRouter from "./routes/web/resultRoute.js"
import voterRouter from "./routes/web/voterRoute.js"

// DESKTOP ROUTERS IMPORT
import desktopElectionRouter from "./routes/desktop/electionRoute.js"
import desktopAuthRouter from "./routes/desktop/authRoute.js"
import desktopVoterRouter from "./routes/desktop/voterRoute.js"
import desktopCandidateRouter from "./routes/desktop/candidateRoute.js"

import { registerDevice } from "./controllers/notificationController.js"

import "./jobs/index.js"

const app = express()

const DEV_ORIGINS = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/
]

const PROD_ORIGINS = [
    "https://elvox-app.vercel.app",
    /^http:\/\/localhost:\d+$/
]

const isAllowed = (origin, list) =>
    list.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin))

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true)

            const allowed =
                process.env.NODE_ENV === "production"
                    ? isAllowed(origin, PROD_ORIGINS)
                    : isAllowed(origin, DEV_ORIGINS)

            if (allowed) return callback(null, true)

            callback(new Error("Not allowed by CORS"))
        },
        credentials: true
    })
)

app.use(cookieParser())
app.use(express.json())

app.get("/", (req, res) => {
    res.status(200).send("Server is running!")
})

app.get("/healthz", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT NOW()")

        res.status(200).json({
            ok: true,
            message: "API and DB healthy",
            time: rows[0].now
        })
    } catch (err) {
        console.error("Health check failed:", err.message)
        console.log(err)

        res.status(500).json({
            ok: false,
            message: "DB connection failed"
        })
    }
})

// REGISTER DEVICE FOR PUSH NOTIFICATION
app.post("/notifications/devices/register", registerDevice)

// WEB ROUTES
app.use("/auth", authRouter)
app.use("/students", studentRouter)
app.use("/teachers", teacherRouter)
app.use("/users", userRouter)
app.use("/classes", authMiddleware, classRouter)
app.use("/elections", authMiddleware, electionRouter)
app.use("/candidates", authMiddleware, candidateRouter)
app.use("/notifications", authMiddleware, notificationRouter)
app.use("/appeals", authMiddleware, appealRouter)
app.use("/results", authMiddleware, resultRouter)
app.use("/voters", authMiddleware, voterRouter)

// DESKTOP ROUTES
app.use("/desktop/verify", desktopAuthRouter)
app.use("/desktop/elections", desktopElectionRouter)
app.use("/desktop/voters", desktopAuthMiddleware, desktopVoterRouter)
app.use("/desktop/candidates", desktopAuthMiddleware, desktopCandidateRouter)

// ERROR HANDLING MIDDLEWARE
app.use(notFound)
app.use(errorHandler)

export default app
