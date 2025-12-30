const maskContact = (value, type) => {
    if (!value) return ""

    if (type === "phone") {
        const digits = value.replace(/\D/g, "")

        return "*".repeat(7) + digits.slice(-3)
    }

    if (type === "email") {
        const [local, domain] = value.split("@")

        if (local.length <= 2) {
            return local[0] + "*".repeat(local.length - 1) + "@" + domain
        }

        const start = local.slice(0, 2)
        const end = local.slice(-2)

        return start + "*".repeat(local.length - 4) + end + "@" + domain
    }

    return ""
}

export default maskContact
