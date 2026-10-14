import { neon } from "@neondatabase/serverless"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in environment")
  }
  return drizzle(neon(databaseUrl))
}

export async function testDatabaseConnection() {
  const db = getDb()
  const result = await db.execute(
    sql`SELECT NOW() as now, version() as version`
  )
  return {
    success: true,
    data: result.rows[0],
  }
}
