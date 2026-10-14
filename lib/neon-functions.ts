export async function testNeonFunction() {
  const functionUrl = process.env.NEON_FUNCTION_HELLO_BASE_URL
  if (!functionUrl) {
    throw new Error("NEON_FUNCTION_HELLO_BASE_URL is not set in environment")
  }

  const response = await fetch(functionUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Musketeers-NextApp/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`Neon Function returned HTTP ${response.status}: ${response.statusText}`)
  }

  const text = await response.text()
  return {
    success: true,
    url: functionUrl,
    status: response.status,
    response: text,
  }
}
