const logConnections = new Map() // Map<electionId, res>
const otpConnections = new Map() // Map<electionId, res>
export const revokeConnections = new Map() // Map<deviceId, res>

export const addLogClient = (electionId, res) => {
    let clients = logConnections.get(electionId)
    if (!clients) {
        clients = new Set()
        logConnections.set(electionId, clients)
    }
    clients.add(res)
}

export const removeLogClient = (electionId, res) => {
    const clients = logConnections.get(electionId)
    if (!clients) return

    clients.delete(res)
    if (clients.size === 0) {
        logConnections.delete(electionId)
    }
}

export const addOtpClient = (electionId, res) => {
    let clients = otpConnections.get(electionId)
    if (!clients) {
        clients = new Set()
        otpConnections.set(electionId, clients)
    }
    clients.add(res)
}

export const removeOtpClient = (electionId, res) => {
    const clients = otpConnections.get(electionId)
    if (!clients) return

    clients.delete(res)
    if (clients.size === 0) {
        otpConnections.delete(electionId)
    }
}

export const emitLog = (electionId, log) => {
    const clients = logConnections.get(electionId)
    if (!clients) return

    const payload = JSON.stringify({
        type: "audit-log",
        ...log
    })

    for (const res of clients) {
        try {
            res.write(`data: ${payload}\n\n`)
        } catch (err) {
            removeLogClient(electionId, res)
        }
    }
}

export const emitOtpUsed = (electionId, payload) => {
    const clients = otpConnections.get(electionId)
    if (!clients) return

    const data = JSON.stringify({
        type: "otp-used",
        ...payload
    })

    for (const res of clients) {
        try {
            res.write(`data: ${data}\n\n`)
        } catch {
            removeOtpClient(electionId, res)
        }
    }
}

export const emitRevoke = (deviceId) => {
    const res = revokeConnections.get(deviceId)
    if (!res) return

    try {
        res.write(`data: ${JSON.stringify({ action: "revoke" })}\n\n`)
    } catch {
        revokeConnections.delete(deviceId)
    }
}
