import * as classService from "../services/classService.js"

export const getClasses = async (req, res, next) => {
    try {
        const classes = await classService.getClasses()

        res.status(200).json(classes)
    } catch (err) {
        next(err)
    }
}
