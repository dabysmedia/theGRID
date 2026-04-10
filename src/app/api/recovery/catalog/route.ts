import { NextResponse } from "next/server"
import { CONDITIONS, TREATMENTS } from "@/lib/recovery-catalog"

export async function GET() {
  return NextResponse.json({ conditions: CONDITIONS, treatments: TREATMENTS })
}
