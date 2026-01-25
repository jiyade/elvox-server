import * as candidateService from "../services/candidateService.js"

export const createCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.createCandidate({
            user: req?.user,
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
        const data = await candidateService.getMyCandidate({
            userId: req?.user?.id,
            electionId: req.query.election
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const checkCandidateExists = async (req, res, next) => {
    try {
        const data = await candidateService.checkCandidateExists(
            req.params.id,
            req.query.election
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.getCandidate({
            id: req.params.id,
            user: req?.user
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
            user: req?.user
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const getBallotEntries = async (req, res, next) => {
    try {
        const data = await candidateService.getBallotEntries(
            req.query.class,
            req.query.election
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const withdrawCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.withdrawCandidate({
            id: req.params.id,
            election_id: req.body.election_id
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const reviewCandidate = async (req, res, next) => {
    try {
        const data = await candidateService.reviewCandidate(
            req.params.id,
            req.body,
            req?.user
        )

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
