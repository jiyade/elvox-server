const connections = new Map()

export const addClient = (electionId, res) => {
    let clients = connections.get(electionId)

    if (!clients) {
        clients = new Set()
        connections.set(electionId, clients)
    }

    clients.add(res)
}

export const removeClient = (electionId, res) => {
    const clients = connections.get(electionId)
    if (!clients) return

    clients.delete(res)

    if (clients.size === 0) {
        connections.delete(electionId)
    }
}

export const emitEvent = (electionId, payload) => {
    const clients = connections.get(electionId)
    if (!clients) return

    clients.forEach((client) => {
        try {
            client.write(`data: ${JSON.stringify(payload)}\n\n`)
        } catch (err) {
            console.error("[emitEvent] Write failed:", err)
        }
    })
}

export const emitLog = (electionId, log) => {
    emitEvent(electionId, {
        type: "audit-log",
        ...log
    })
}
