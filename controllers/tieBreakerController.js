import * as tieBreakerService from "../services/tieBreakerService.js"

export const getClassTieBreakerStatus = async (req, res, next) => {
    try {
        const data = await tieBreakerService.getClassTieBreakerStatus(
            req.params.id,
            req.params.classId
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const resolveTieBreaker = async (req, res, next) => {
    try {
        const data = await tieBreakerService.resolveTieBreaker(
            req.params.id,
            req.params.classId,
            req.body,
            req?.user
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
