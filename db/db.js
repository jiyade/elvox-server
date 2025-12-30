import pg from "pg"
const { Pool } = pg

const pool = new Pool({
    connectionString: process.env.DB_URL
})

pool.on("error", (err) => {
    console.error("Unexpected PG pool error:", err.message)
})

export default pool
