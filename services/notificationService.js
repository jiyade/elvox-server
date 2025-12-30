import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"

export const getNotifications = async (userId) => {
    if (!userId) throw new CustomError("User id is required", 400)

    const res = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
    )

    return res.rows
}

export const markNotificationRead = async (data) => {
    const { notificationId, userId } = data

    if (!notificationId)
        throw new CustomError("Notification id is required", 400)
    if (!userId) throw new CustomError("User id is required", 400)

    const res = await pool.query(
        "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
        [notificationId, userId]
    )

    if (res.rowCount === 0) throw new CustomError("Notification not found", 404)
}

export const sendNotification = async (userIds, { message, type }) => {
    if (!userIds.length) return

    const query = `
    INSERT INTO notifications (user_id, message, type)
    SELECT UNNEST($1::uuid[]), $2, $3
  `

    await pool.query(query, [userIds, message, type])
}
