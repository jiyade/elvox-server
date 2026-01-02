import * as voterService from "../services/voterService.js"

export const verifyVoter = async (req, res, next) => {
    try {
        const data = await voterService.verifyVoter({
            admno: req.body.admno,
            electionId: req.body.electionId,
            userId: req.user.id
        })

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
