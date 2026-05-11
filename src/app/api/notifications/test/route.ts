import { NextRequest, NextResponse } from "next/server"
import { resolveUserId, UserError } from "@/lib/current-user"
import { sendPushToUser } from "@/lib/notifications/server/send"

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const result = await sendPushToUser(userId, {
      title: "THEGRID test",
      body: "Push notifications are working on this device.",
      url: "/",
      type: "test",
      tag: "test",
    })
    if (result.successCount === 0 && result.failureCount === 0) {
      return NextResponse.json(
        { error: "No active subscriptions on this account." },
        { status: 404 }
      )
    }
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[notif test]", e)
    return NextResponse.json({ error: "Failed to send" }, { status: 500 })
  }
}
