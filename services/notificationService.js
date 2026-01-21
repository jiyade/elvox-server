import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import axios from "axios"

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

export const registerDevice = async (data) => {
    const { userId, deviceId, pushToken, platform } = data
    if (!userId) throw new CustomError("User id is required")
    if (!deviceId) throw new CustomError("Device id is required")
    if (!pushToken) throw new CustomError("Push token is required")
    if (!platform) throw new CustomError("Platform is required")

    const query = `
        INSERT INTO push_notification_devices (user_id, device_id, push_token, platform, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (device_id) 
        DO UPDATE SET 
            push_token = $3,
            user_id = $1,
            platform = $4,
            updated_at = NOW()
    `

    await pool.query(query, [userId, deviceId, pushToken, platform])

    return { success: true }
}

const sendPushNotifications = async (pushTokens, title, body, data = {}) => {
    if (!pushTokens?.length) return

    const messages = pushTokens.map((token) => ({
        to: token,
        sound: "default",
        title: title,
        body: body,
        data: data,
        priority: "high",
        channelId: "default"
    }))

    try {
        const response = await axios.post(
            "https://exp.host/--/api/v2/push/send",
            messages,
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            }
        )

        return response.data
    } catch (error) {
        console.error(
            "Error sending push notifications:",
            error.response?.data || error.message
        )
    }
}

export const sendNotification = async (
    userIds,
    { message, type, title, data },
    client = null
) => {
    if (!userIds?.length) return

    const executor = client ?? pool

    // 1. Insert into notifications table (your existing logic)
    const query = `
        INSERT INTO notifications (user_id, message, type)
        SELECT UNNEST($1::uuid[]), $2, $3
    `
    await executor.query(query, [userIds, message, type])

    // 2. Get push tokens for these users
    const pushTokenQuery = `
        SELECT DISTINCT push_token 
        FROM push_notification_devices 
        WHERE user_id = ANY($1::uuid[])
        AND push_token IS NOT NULL
    `
    const result = await executor.query(pushTokenQuery, [userIds])
    const pushTokens = result.rows.map((row) => row.push_token)

    // 3. Send push notifications
    if (pushTokens.length > 0) {
        await sendPushNotifications(
            pushTokens,
            title || "New Notification",
            message,
            { type, ...data }
        )
    }
}
