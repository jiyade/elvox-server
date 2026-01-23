export default class CustomError extends Error {
    constructor(message, status = 400, code = null) {
        super(message)
        this.status = status
        this.code = code
    }
}
