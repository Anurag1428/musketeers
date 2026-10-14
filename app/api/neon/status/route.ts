import { NextResponse } from "next/server"
import { testDatabaseConnection } from "@/lib/neon-db"
import { testObjectStorage } from "@/lib/neon-storage"
import { testNeonFunction } from "@/lib/neon-functions"
import { testAiGateway } from "@/lib/neon-ai-gateway"

export const dynamic = "force-dynamic"

export async function GET() {
  const results: {
    timestamp: string
    branch: string | undefined
    services: {
      postgres: { success: boolean; data?: unknown; error?: string }
      objectStorage: { success: boolean; data?: unknown; error?: string }
      functions: { success: boolean; data?: unknown; error?: string }
      aiGateway: { success: boolean; data?: unknown; error?: string }
    }
  } = {
    timestamp: new Date().toISOString(),
    branch: process.env.NEON_BRANCH,
    services: {
      postgres: { success: false },
      objectStorage: { success: false },
      functions: { success: false },
      aiGateway: { success: false },
    },
  }

  // 1. Test Postgres
  try {
    const pg = await testDatabaseConnection()
    results.services.postgres = { success: true, data: pg }
  } catch (err: unknown) {
    results.services.postgres = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // 2. Test Object Storage
  try {
    const storage = await testObjectStorage()
    results.services.objectStorage = { success: true, data: storage }
  } catch (err: unknown) {
    results.services.objectStorage = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // 3. Test Neon Functions
  try {
    const fn = await testNeonFunction()
    results.services.functions = { success: true, data: fn }
  } catch (err: unknown) {
    results.services.functions = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // 4. Test AI Gateway
  try {
    const ai = await testAiGateway()
    results.services.aiGateway = {
      success: ai.available,
      data: ai,
    }
  } catch (err: unknown) {
    results.services.aiGateway = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return NextResponse.json(results)
}
