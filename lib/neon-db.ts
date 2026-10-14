import { neon } from "@neondatabase/serverless"

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in environment")
  }
  return neon(databaseUrl)
}

export async function testDatabaseConnection() {
  const sql = getDb()
  const result = await sql`SELECT NOW() as now, version() as version`
  return {
    success: true,
    data: result[0],
  }
}
