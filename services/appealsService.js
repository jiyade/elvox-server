import pool from "../db/db.js"
import CustomError from "../utils/CustomError.js"
import { getURL, uploadFile } from "../utils/file.js"
import { getElection } from "./electionService.js"

export const createAppeal = async (data) => {
    const {
        category,
        election_id: electionId,
        subject,
        description
    } = data?.body
    const { id: userId } = data.user

    if (!category) throw new CustomError("Appeal category is required", 400)
    if (!electionId) throw new CustomError("Election is required", 400)
    if (!subject) throw new CustomError("Appeal subject is required", 400)
    if (!description)
        throw new CustomError("Appeal description is required", 400)

    if (data?.files?.length > 3)
        throw new CustomError("Maximum 3 attachments allowed", 400)

    const election = await getElection(electionId)

    if (Date.now() > new Date(election.election_end))
        throw new CustomError("Election has closed", 403)

    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        const res = await client.query(
            "INSERT INTO appeals (user_id, election_id, category, subject, description) VALUES ($1, $2, $3, $4, $5) RETURNING  id, election_id, user_id, category, subject, description, status, created_at",
            [userId, electionId, category, subject, description]
        )

        const appealId = res.rows[0].id

        if (data?.files?.length) {
            for (const file of data.files) {
                const attachment = await uploadFile(
                    file,
                    "appeal-attachments",
                    userId
                )

                await client.query(
                    "INSERT INTO appeal_attachments (appeal_id,file_url,file_type) VALUES ($1, $2, $3)",
                    [appealId, getURL(attachment.path), file.mimetype]
                )
            }
        }

        await client.query("COMMIT")

        return { message: "Appeal submitted", data: res.rows[0] }
    } finally {
        client.release()
    }
}

export const getAppeals = async (data) => {
    const { role, userId, electionId } = data

    if (!electionId) throw new CustomError("Election id is required", 400)

    let appeals

    if (role === "admin") {
        const res = await pool.query(
            "SELECT * FROM appeals WHERE election_id = $1 ORDER BY created_at DESC",
            [electionId]
        )

        appeals = res.rows
    } else {
        const res = await pool.query(
            "SELECT * FROM appeals WHERE user_id = $1 AND  election_id = $2 ORDER BY created_at DESC",
            [userId, electionId]
        )

        appeals = res.rows
    }

    return appeals
}
