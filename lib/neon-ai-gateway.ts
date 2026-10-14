export async function testAiGateway() {
  const token = process.env.NEON_AI_GATEWAY_TOKEN
  const baseUrl = process.env.NEON_AI_GATEWAY_BASE_URL

  if (!token || !baseUrl) {
    return {
      available: false,
      reason:
        "AI Gateway is not available on Neon Free tier. Provisioning was blocked by Neon with: 'This neon.ts enables the AI Gateway, which isn't available on the Free plan'. A paid plan is required to enable and use the AI Gateway.",
    }
  }

  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await res.json()
    return {
      available: res.ok,
      status: res.status,
      data,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      available: false,
      error: message,
    }
  }
}
