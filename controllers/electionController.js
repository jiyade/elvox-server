import * as electionService from "../services/electionService.js"

export const getElections = async (req, res, next) => {
    try {
        const elections = await electionService.getElections()

        return res.status(200).json(elections)
    } catch (err) {
        next(err)
    }
}

export const getElection = async (req, res, next) => {
    try {
        const election = await electionService.getElection(req.params.id)

        return res.status(200).json(election)
    } catch (err) {
        next(err)
    }
}
