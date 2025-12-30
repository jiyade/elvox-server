import * as teacherService from "../services/teacherService.js"

export const getTeacher = async (req, res, next) => {
    try {
        const data = await teacherService.getTeacher(req.params.empcode)

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}

export const checkTeacherExists = async (req, res, next) => {
    try {
        const data = await teacherService.checkTeacherExists(req.params)

        res.status(200).json(data)
    } catch (err) {
        next(err)
    }
}
