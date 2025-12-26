import express from "express"
import "dotenv/config"
import cors from "cors"
import cookieParser from "cookie-parser"
import pool from "./db/db.js"
import errorHandler from "./middleware/errorHandler.js"
import notFound from "./middleware/notFound.js"
import auth from "./middleware/auth.js"

import authRouter from "./routes/authRoute.js"
import studentRouter from "./routes/studentRoute.js"
import teacherRouter from "./routes/teacherRoute.js"
import userRouter from "./routes/userRoute.js"
import classRouter from "./routes/classRoute.js"
import electionRouter from "./routes/electionRoute.js"
import candidateRouter from "./routes/candidateRoute.js"
import notificationRouter from "./routes/notificationRoute.js"

const app = express()

app.use(
    cors({
        origin: ["http://localhost:5173", "https://elvox-app.vercel.app"],
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

app.use("/auth", authRouter)
app.use("/students", studentRouter)
app.use("/teachers", teacherRouter)
app.use("/users", userRouter)
app.use("/classes", auth, classRouter)
app.use("/elections", auth, electionRouter)
app.use("/candidates", auth, candidateRouter)
app.use("/notifications", auth, notificationRouter)

app.use(notFound)
app.use(errorHandler)

export default app
