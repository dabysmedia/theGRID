import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  ALLOWED_FOOD_IMAGE_TYPES,
  FOOD_UPLOAD_URL_PREFIX,
  MAX_FOOD_IMAGE_BYTES,
  foodImageExtension,
  getFoodUploadDirForUser,
  resolveFoodUploadPath,
} from "@/lib/calories/food-uploads"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a picture first." }, { status: 400 })
    }
    if (!ALLOWED_FOOD_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, or WebP image." },
        { status: 400 },
      )
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.byteLength > MAX_FOOD_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 6 MB or smaller." }, { status: 400 })
    }

    const directory = getFoodUploadDirForUser(userId)
    fs.mkdirSync(directory, { recursive: true })
    const filename = `${randomUUID()}.${foodImageExtension(file.type)}`
    fs.writeFileSync(path.join(directory, filename), buffer)
    return NextResponse.json(
      { url: `${FOOD_UPLOAD_URL_PREFIX}${path.basename(directory)}/${filename}` },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[recipes upload POST]", error)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const url = req.nextUrl.searchParams.get("url")
    if (!url) return NextResponse.json({ error: "URL required." }, { status: 400 })
    const filePath = resolveFoodUploadPath({ url, userId })
    if (!filePath) return NextResponse.json({ error: "Invalid image." }, { status: 400 })
    fs.unlinkSync(filePath)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Could not delete image." }, { status: 500 })
  }
}
