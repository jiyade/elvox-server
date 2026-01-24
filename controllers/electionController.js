import * as electionService from "../services/electionService.js"

export const getElection = async (req, res, next) => {
    try {
        const elections = await electionService.getElection(req?.user?.role)

        return res.status(200).json(elections)
    } catch (err) {
        next(err)
    }
}

export const getElectionDetails = async (req, res, next) => {
    try {
        const election = await electionService.getElectionDetails(req.params.id)

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
        const supervisors = await electionService.getSupervisors(req.params.id)

        return res.status(200).json(supervisors)
    } catch (err) {
        next(err)
    }
}

export const updateSupervisors = async (req, res, next) => {
    try {
        const data = await electionService.updateSupervisors(
            req?.user,
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const createElection = async (req, res, next) => {
    try {
        const data = await electionService.createElection(req?.user, req.body)

        return res.status(201).json(data)
    } catch (err) {
        next(err)
    }
}

export const deleteElection = async (req, res, next) => {
    try {
        await electionService.deleteElection(req?.user, req.params.id)

        return res.status(204).end()
    } catch (err) {
        next(err)
    }
}

export const updateElection = async (req, res, next) => {
    try {
        const data = await electionService.updateElection(
            req?.user,
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getReservedClasses = async (req, res, next) => {
    try {
        const data = await electionService.getReservedClasses(req.params.id)

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const updateReservedClasses = async (req, res, next) => {
    try {
        const data = await electionService.updateReservedClasses(
            req?.user,
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const updateAutoPublishResults = async (req, res, next) => {
    try {
        const data = await electionService.updateAutoPublishResults(
            req?.user,
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

// GENERATES OR REGENERATES THE SECRET KEY
export const generateSecretKey = async (req, res, next) => {
    try {
        const data = await electionService.generateSecretKey(
            req?.user,
            req.params.id
        )

        return res.status(201).json(data)
    } catch (err) {
        next(err)
    }
}

// ACTIVATE VOTING SYSTEM USING SECRET KEY
export const activateVotingSystem = async (req, res, next) => {
    try {
        const data = await electionService.activateVotingSystem(
            req.params.id,
            req.body
        )

        return res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
