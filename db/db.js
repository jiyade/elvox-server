import pg from "pg"
const { Pool } = pg

const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true
})

pool.on("error", (err) => {
    console.error("Unexpected PG pool error:", err)
})

export default pool
