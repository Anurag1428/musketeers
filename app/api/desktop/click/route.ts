import { NextResponse } from "next/server"
import { desktopMouseClick } from "@/lib/desktop-agent"

export async function POST(req: Request) {
  try {
    const { x, y } = await req.json()
    if (typeof x !== "number" || typeof y !== "number") {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }
    await desktopMouseClick(x, y, "left", false)
    return NextResponse.json({ success: true, x, y })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
