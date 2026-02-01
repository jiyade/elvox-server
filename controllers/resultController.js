import * as resultService from "../services/resultService.js"

export const getResults = async (req, res, next) => {
    try {
        const data = await resultService.getReults(
            req.params.electionId,
            req.query
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getRandomCandidatesResults = async (req, res, next) => {
    try {
        const data = await resultService.getRandomCandidatesResults(
            req.query.limit
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const publishResults = async (req, res, next) => {
    try {
        const data = await resultService.publishResults(
            req.params.id,
            req?.user
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const exportResults = async (req, res, next) => {
    try {
        await resultService.exportResults(req.params.electionId, req.query, res)
    } catch (err) {
        next(err)
    }
}
