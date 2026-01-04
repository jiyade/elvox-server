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
    const { id: userId, name: userName, role: userRole } = data.user

    const APPEAL_CATEGORIES = [
        "candidate_application",
        "election_result",
        "voting_issue",
        "account_access",
        "other"
    ]

    if (!category) throw new CustomError("Appeal category is required", 400)
    if (!APPEAL_CATEGORIES.includes(category.toLowerCase()))
        throw new CustomError("Invalid appeal category", 400)
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
            [userId, electionId, category.toLowerCase(), subject, description]
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
                    "INSERT INTO appeal_attachments (appeal_id,file_url,file_type, file_name) VALUES ($1, $2, $3, $4)",
                    [
                        appealId,
                        getURL(attachment.path),
                        file.mimetype,
                        file.originalname
                    ]
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

    const baseQuery = `
        SELECT
            a.*,
            u.role AS user_role,
            u.name AS user_name,
            suv.admno,
            tuv.empcode
        FROM appeals a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN student_user_view suv ON suv.user_id = a.user_id
        LEFT JOIN teacher_user_view tuv ON tuv.user_id = a.user_id
        WHERE a.election_id = $1
    `

    const adminQuery = `
        ${baseQuery}
        ORDER BY a.created_at DESC
    `

    const userQuery = `
        ${baseQuery}
        AND a.user_id = $2
        ORDER BY a.created_at DESC
    `

    const res =
        role === "admin"
            ? await pool.query(adminQuery, [electionId])
            : await pool.query(userQuery, [electionId, userId])

    return res.rows
}

export const getAppeal = async (data) => {
    const { role, userId, appealId } = data

    if (!appealId) throw new CustomError("Appeal id is required", 400)

    const res = await pool.query(
        `
        SELECT
            a.*,
            u.role AS user_role,
            u.name  AS user_name,
            suv.admno,
            tuv.empcode
        FROM appeals a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN student_user_view suv ON suv.user_id = a.user_id
        LEFT JOIN teacher_user_view tuv ON tuv.user_id = a.user_id
        WHERE a.id = $1
        `,
        [appealId]
    )

    if (res.rowCount === 0) throw new CustomError("Appeal not found", 404)

    if (res.rows[0].user_id !== userId && role !== "admin")
        throw new CustomError("Forbidden", 403)

    const attachments = await pool.query(
        "SELECT * FROM appeal_attachments WHERE appeal_id = $1",
        [appealId]
    )

    const appeal = {
        ...res.rows[0],
        identifier:
            res.rows[0].user_role === "student"
                ? res.rows[0].admno
                : res.rows[0].empcode,
        attachments: attachments.rows
    }

    return appeal
}

export const updateAppealStatus = async (data) => {
    const { appealId, adminNote, status } = data

    if (!adminNote?.trim()) throw new CustomError("Admin note is required", 400)
    if (status !== "approved" && status !== "rejected") {
        throw new CustomError("Invalid status", 400)
    }

    const res = await pool.query(
        "SELECT status, election_id from appeals WHERE id = $1",
        [appealId]
    )

    if (res.rowCount === 0) throw new CustomError("Appeal not found", 404)

    if (res.rows[0].status !== "pending")
        throw new CustomError("Appeal already reviewed", 409)

    const election = await getElection(res.rows[0].election_id)

    if (Date.now() > new Date(election.election_end))
        throw new CustomError("Election has closed", 409)

    const updateRes = await pool.query(
        "UPDATE appeals SET status = $1, admin_comment = $2 WHERE id = $3 AND status = 'pending' RETURNING id, status, admin_comment",
        [status, adminNote.trim(), appealId]
    )

    if (updateRes.rowCount === 1) return updateRes.rows[0]

    const checkRes = await pool.query(
        "SELECT status FROM appeals WHERE id = $1",
        [appealId]
    )

    throw new CustomError("Appeal already resolved", 409)
}
