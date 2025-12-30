import * as notificationService from "../services/notificationService.js"

export const getNotifications = async (req, res, next) => {
    try {
        const data = await notificationService.getNotifications(req.user.id)

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const markNotificationRead = async (req, res, next) => {
    try {
        await notificationService.markNotificationRead({
            userId: req.user.id,
            notificationId: req.params.id
        })

        return res.status(200).json({ success: true })
    } catch (err) {
        next(err)
    }
}
