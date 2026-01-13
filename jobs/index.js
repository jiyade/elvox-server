import pool from "../db/db.js"
import { advanceElectionStatus } from "./advanceElectionStatus.js"
import { sendDeadlineNotifications } from "./sendDeadlineNotifications.js"

let running = false

const runCron = async () => {
    if (running) return
    running = true

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const { rows } = await client.query(
            `SELECT id FROM elections WHERE status != 'closed'`
        )

        for (const { id } of rows) {
            await advanceElectionStatus(client, id)
            await sendDeadlineNotifications(pool, id)
        }

        await client.query("COMMIT")
    } catch (err) {
        await client.query("ROLLBACK")
        console.error("Cron failed:", err)
    } finally {
        client.release()
        running = false
    }
}

// run every 30 seconds
setInterval(runCron, 30000)

runCron()
