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

export const emitLog = (electionId, log) => {
    const clients = connections.get(electionId)
    if (!clients) return

    clients.forEach((client) => {
        try {
            client.write(`data: ${JSON.stringify(log)}\n\n`)
        } catch (err) {
            console.error("[emitLog] Write failed:", err)
        }
    })
}
