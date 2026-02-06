export const initSSE = (res, onClose) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const heartbeat = setInterval(() => {
        res.write(":\n\n") // SSE Comment
    }, 15000)

    res.on("close", () => {
        clearInterval(heartbeat)
        onClose?.()
    })
}
