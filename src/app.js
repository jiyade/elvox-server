import express from "express"
import "dotenv/config"
import cors from "cors"
import cookieParser from "cookie-parser"
import authRouter from "./routes/authRoute.js"
import errorHandler from "./middleware/errorHandler.js"
import notFound from "./middleware/notFound.js"
import pool from "./db/db.js"

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
    const { rows } = await pool.query("SELECT NOW()");
    
    res.status(200).json({
      ok: true,
      message: "API and DB healthy",
      time: rows[0].now
    });
  } catch (err) {
    console.error("Health check failed:", err.message);

    res.status(500).json({
      ok: false,
      message: "DB connection failed"
    });
  }
});

app.use("/auth", authRouter)

app.use(notFound)
app.use(errorHandler)

export default app
