import crypto from "crypto"
import { supabase } from "../config/supabase.js"

export const uploadFile = async (file, folder, admno) => {
    const path = `${folder}/${crypto.randomUUID()}-${admno}`

    const { data, error } = await supabase.storage
        .from("elvox-assets")
        .upload(path, file.buffer, { contentType: file.mimetype })

    if (error) {
        throw error
    }

    return data
}

export const deleteFile = async (path) => {
    if (!path) return
    await supabase.storage.from("elvox-assets").remove([path])
}

export const getURL = (path) => {
    const { data } = supabase.storage.from("elvox-assets").getPublicUrl(path)

    const url = data.publicUrl

    return url
}
