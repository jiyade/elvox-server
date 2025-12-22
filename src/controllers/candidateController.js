import * as candidateService from "../services/candidateService.js"

export const createCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.createCandidate({
            user: req.user,
            body: req.body,
            files: req.files
        })

        res.status(201).json(data)
    } catch (err) {
        next(err)
    }
}

export const getMyCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.getMyCandidate(req.user.id)

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.getCandidate({
            id: req.params.id,
            user: req.user
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getCandidates = async (req, res, next) => {
    try {
        const data = await candidateService.getCandidates({
            query: req.query,
            user: req.user
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
