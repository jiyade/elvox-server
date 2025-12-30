import * as appealService from "../services/appealsService.js"

export const createAppeal = async (req, res, next) => {
    try {
        const data = await appealService.createAppeal({
            user: req.user,
            body: req.body,
            files: req.files
        })

        res.status(201).json(data)
    } catch (err) {
        next(err)
    }
}

export const getAppeals = async (req, res, next) => {
    try {
        const data = await appealService.getAppeals({
            role: req.user.role,
            userId: req.user.id,
            electionId: req.query.election
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
