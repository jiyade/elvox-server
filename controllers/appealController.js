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

export const getAppeal = async (req, res, next) => {
    try {
        const data = await appealService.getAppeal({
            role: req.user.role,
            userId: req.user.id,
            appealId: req.params.id
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const updateAppealStatus = async (req, res, next) => {
    try {
        const data = await appealService.updateAppealStatus(req.user, {
            appealId: req.params.id,
            adminNote: req.body.adminNote,
            status: req.body.status
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
