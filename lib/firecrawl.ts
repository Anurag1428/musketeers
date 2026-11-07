import { Firecrawl } from "@mendable/firecrawl-js"

/**
 * Checks whether the Firecrawl API key is present in environment variables.
 */
export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim())
}

/**
 * Returns a Firecrawl client instance if configured, or null.
 */
export function getFirecrawlClient(): Firecrawl | null {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (!apiKey) {
    return null
  }
  return new Firecrawl({ apiKey })
}

export interface ScrapedPageResult {
  success: boolean
  url: string
  title?: string
  description?: string
  markdown?: string
  error?: string
}

export interface SearchResultItem {
  title: string
  url: string
  description?: string
  markdown?: string
}

export interface WebSearchResult {
  success: boolean
  query: string
  results: SearchResultItem[]
  error?: string
}

/**
 * Scrapes any website into clean, LLM-ready Markdown in a single API call.
 * Automatically handles anti-bot, Cloudflare, and JavaScript hydration.
 */
export async function scrapeWebpage(url: string): Promise<ScrapedPageResult> {
  const client = getFirecrawlClient()
  if (!client) {
    return {
      success: false,
      url,
      error:
        "Firecrawl API key is not configured. Please set FIRECRAWL_API_KEY in .env.local to enable web scraping.",
    }
  }

  try {
    const targetUrl = url.startsWith("http") ? url : `https://${url}`
    const doc = await client.scrape(targetUrl, {
      formats: ["markdown"],
    })

    return {
      success: true,
      url: targetUrl,
      title: doc.metadata?.title || "",
      description: doc.metadata?.description || "",
      markdown: doc.markdown || "",
    }
  } catch (error: any) {
    return {
      success: false,
      url,
      error: error?.message || "Failed to scrape webpage with Firecrawl",
    }
  }
}

export interface SearchWebOptions {
  limit?: number
  /**
   * Time-based search filter.
   * "qdr:d" = past 24 hours
   * "qdr:w" = past week (5-7 days)
   * "qdr:m" = past month
   */
  tbs?: string
}

/**
 * Searches the web using Firecrawl, bypassing search-engine CAPTCHAs and returning
 * ranked results with clean content.
 */
export async function searchWeb(
  query: string,
  options: number | SearchWebOptions = 5
): Promise<WebSearchResult> {
  const client = getFirecrawlClient()
  if (!client) {
    return {
      success: false,
      query,
      results: [],
      error:
        "Firecrawl API key is not configured. Please set FIRECRAWL_API_KEY in .env.local to enable web search.",
    }
  }

  const limit = typeof options === "number" ? options : (options.limit ?? 5)
  const tbs = typeof options === "object" ? options.tbs : undefined

  try {
    const searchParams: Record<string, any> = { limit }
    if (tbs) {
      searchParams.tbs = tbs
    }

    const data = await client.search(query, searchParams)

    const results: SearchResultItem[] = []
    const rawItems =
      (data as any)?.web ||
      (data as any)?.data ||
      (data as any)?.results ||
      []

    for (const item of rawItems) {
      results.push({
        title: item.title || item.metadata?.title || "",
        url: item.url || item.metadata?.sourceURL || "",
        description: item.description || item.metadata?.description || "",
        markdown: item.markdown || item.content || "",
      })
    }

    return {
      success: true,
      query,
      results,
    }
  } catch (error: any) {
    return {
      success: false,
      query,
      results: [],
      error: error?.message || "Failed to search the web with Firecrawl",
    }
  }
}

export interface FounderLinkedInProfile {
  name: string
  role: string
  linkedinUrl: string
  snippet?: string
}

/**
 * Performs a targeted LinkedIn X-Ray search for a startup's founder/CTO via Firecrawl,
 * bypassing Google CAPTCHAs and LinkedIn login walls.
 */
export async function searchFounderLinkedIn(
  companyName: string,
  role = '("Founder" OR "Co-founder" OR "CEO" OR "CTO")'
): Promise<{
  success: boolean
  companyName: string
  profiles: FounderLinkedInProfile[]
  error?: string
}> {
  const query = `site:linkedin.com/in "${companyName}" ${role}`
  const searchRes = await searchWeb(query, 3)

  if (!searchRes.success) {
    return {
      success: false,
      companyName,
      profiles: [],
      error: searchRes.error,
    }
  }

  const profiles: FounderLinkedInProfile[] = []

  for (const item of searchRes.results) {
    if (!item.url.includes("linkedin.com/in/")) continue

    // Title typically formatted as: "Name - Title, Company | LinkedIn" or "Name – Co-founder & CEO..."
    const titleParts = item.title.split(/\s+[-–—|:]\s+/).map((p) => p.trim())
    const name = titleParts[0]?.replace(/\s*\(.*\)/, "") || "Founder"
    const parsedRole =
      titleParts[1]?.replace(/\|\s*LinkedIn/i, "").trim() ||
      "Founder / Executive"

    profiles.push({
      name,
      role: parsedRole,
      linkedinUrl: item.url,
      snippet: item.description || item.markdown?.slice(0, 200),
    })
  }

  return {
    success: true,
    companyName,
    profiles,
  }
}
