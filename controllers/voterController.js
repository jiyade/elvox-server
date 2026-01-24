import * as voterService from "../services/voterService.js"

export const verifyVoter = async (req, res, next) => {
    try {
        const data = await voterService.verifyVoter(req?.user, {
            admno: req.body.admno,
            electionId: req.body.electionId
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const authenticateVoter = async (req, res, next) => {
    try {
        const data = await voterService.authenticateVoter({
            admno: req.body.admno,
            otp: req.body.otp,
            electionId: req.body.electionId,
            device: req?.device
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
