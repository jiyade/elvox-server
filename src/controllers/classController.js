import * as classService from "../services/classService.js"

export const getClasses = async (req, res, next) => {
    try {
        const classes = await classService.getClasses()

        res.status(200).json(classes)
    } catch (err) {
        next(err)
    }
}

export const getClass = async (req, res, next) => {
    try {
        const data = await classService.getClass(req.params.id)

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
