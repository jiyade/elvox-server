import pool from "../db/db.js"
import { createLog } from "../services/logService.js"
import { advanceElectionStatus } from "./advanceElectionStatus.js"
import { sendDeadlineNotifications } from "./sendDeadlineNotifications.js"

let running = false

const runCron = async () => {
    if (running) return

    running = true

    let client
    let electionId = null

    try {
        client = await pool.connect()

        await client.query("BEGIN")

        const res = await client.query(
            `SELECT id FROM elections WHERE status != 'closed' FOR UPDATE LIMIT 1`
        )

        if (res.rowCount === 0) {
            await client.query("COMMIT")
            return
        }

        electionId = res.rows[0].id

        await advanceElectionStatus(client, electionId)

        await client.query("COMMIT")

        await sendDeadlineNotifications(electionId)
    } catch (err) {
        try {
            if (client) await client.query("ROLLBACK")
        } catch {}
        console.error("Cron failed:", err.message)

        await createLog(electionId, {
            level: "error",
            message: `System cron failed: ${err.message}`
        })
    } finally {
        if (client) client.release()
        running = false
    }
}

// run every 30 seconds
setInterval(runCron, 30000)
