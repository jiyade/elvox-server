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

export const getAllElections = async (req, res, next) => {
    try {
        const elections = await electionService.getAllElections()

        return res.status(200).json(elections)
    } catch (err) {
        next(err)
    }
}

export const getSupervisors = async (req, res, next) => {
    try {
        const supervisors = await electionService.getSupervisors()

        return res.status(200).json(supervisors)
    } catch (err) {
        next(err)
    }
}

export const updateSupervisors = async (req, res, next) => {
    try {
        const data = await electionService.updateSupervisors(
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
