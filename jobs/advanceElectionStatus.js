import { getExpectedStatus, STATUS_ORDER } from "../utils/electionStatus.js"
import { sendNotification } from "../services/notificationService.js"
import { createLog } from "../services/logService.js"

const STATUS_MESSAGES = {
    nominations: "Nominations are now open",
    "pre-voting": "Nominations have closed",
    voting: "Voting is now open",
    "post-voting": "Voting has closed",
    closed: "The election has ended"
}

export const advanceElectionStatus = async (client, electionId) => {
    const now = new Date()

    // lock election
    const { rows } = await client.query(
        `
        SELECT *
        FROM elections
        WHERE id = $1
        FOR UPDATE
        `,
        [electionId]
    )

    if (!rows.length) return

    const election = rows[0]
    const expectedStatus = getExpectedStatus(election, now)

    if (expectedStatus === election.status) return

    const currentIndex = STATUS_ORDER.indexOf(election.status)
    const expectedIndex = STATUS_ORDER.indexOf(expectedStatus)

    // no backward / same update
    if (expectedIndex <= currentIndex) return

    // update status
    await client.query(
        `
        UPDATE elections
        SET status = $1
        WHERE id = $2
        `,
        [expectedStatus, electionId]
    )

    // log status change
    await createLog(
        electionId,
        {
            level: "info",
            message: `Election status advanced by system scheduler for ${election.name}`
        },
        client
    )

    // fetch users for user id to send notifications
    const { rows: users } = await client.query(
        `SELECT u.id, u.role, CASE WHEN t.user_id IS NOT NULL THEN true ELSE false END AS is_tutor FROM users u LEFT JOIN teachers t ON t.user_id = u.id`
    )

    // send status update notifications to users
    const statusMessage = STATUS_MESSAGES[expectedStatus]

    if (statusMessage) {
        const userIds = users.map((u) => u.id)

        await sendNotification(
            userIds,
            { message: statusMessage, type: "info" },
            client
        )
    }
}
