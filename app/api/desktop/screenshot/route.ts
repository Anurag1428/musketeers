import { NextResponse } from "next/server"
import { takeDesktopScreenshot } from "@/lib/desktop-agent"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { base64 } = await takeDesktopScreenshot()
    const buffer = Buffer.from(base64, "base64")
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to capture screenshot" },
      { status: 500 }
    )
  }
}
