import CustomError from "../utils/CustomError.js"

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) return next(new CustomError("Not authenticated", 401))
        if (!allowedRoles.includes(req.user.role)) {
            return next(new CustomError("Forbidden", 403))
        }
        next()
    }
}

export default requireRole
