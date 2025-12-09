import * as studentService from "../services/studentService.js"

export const getStudent = async (req, res, next) => {
    try {
        const data = await studentService.getStudent(req.params.admno)

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
