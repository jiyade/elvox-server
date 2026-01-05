import CustomError from "../utils/CustomError.js"

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) return next(new CustomError("Not authenticated", 401))

        const role = req.user?.effectiveRole ?? req.user.role

        const isAuthorized =
            allowedRoles.includes(role) ||
            (allowedRoles.includes("tutor") && req.user?.tutor_of !== null)

        if (!isAuthorized) return next(new CustomError("Forbidden", 403))

        next()
    }
}

export default requireRole
