import dns from "node:dns/promises"

export interface FundedStartupItem {
  companyName: string
  fundingAmount: string
  round: string
  headline: string
  articleUrl: string
  domain?: string
  publishedAt?: string
}

export interface MxVerificationResult {
  domain: string
  hasLiveMx: boolean
  topExchange: string | null
  provider: "Google Workspace" | "Microsoft 365" | "ProtonMail" | "Zoho" | "Custom / Other" | "None"
  recommendedEmail: string
  fallbackEmails: string[]
  githubCommitEmail?: string | null
}

/**
 * Decodes HTML entities commonly found in RSS titles & summaries.
 */
function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim()
}

/**
 * Sweeps live RSS funding feeds (Google News Startup Funding, TechCrunch Venture)
 * for real startups that announced Seed or Series A funding in the past 7 days.
 */
export async function fetchLiveFundingFeed(
  query = "AI startup raises Seed OR 'Series A' when:7d"
): Promise<FundedStartupItem[]> {
  const encodedQuery = encodeURIComponent(query)
  const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`

  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Musketeers/1.0",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch funding RSS: HTTP ${res.status}`)
    }

    const xml = await res.text()
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g
    const items: FundedStartupItem[] = []

    let match: RegExpExecArray | null
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const rawTitle = decodeHtml(match[1] || "")
      const articleUrl = match[2]?.trim() || ""
      const publishedAt = match[3]?.trim() || ""

      // Extract funding amount ($X million, $XM, etc.)
      const amountMatch = rawTitle.match(/(\$\d+(?:\.\d+)?\s*(?:million|M|billion|B|k))/i)
      const fundingAmount = amountMatch ? amountMatch[1] : "Undisclosed"

      // Extract round (Seed, Series A, Series B, Pre-seed)
      const roundMatch = rawTitle.match(/\b(Pre-Seed|Seed|Series A|Series B|Series C)\b/i)
      const round = roundMatch ? roundMatch[1] : "Venture"

      // Extract probable company name
      // Headlines usually follow: "[Startup Name] raises $X..." or "AI startup [Name] secures..."
      let companyName = "Unknown"
      const raisesMatch = rawTitle.match(/^(?:AI\s+startup\s+|Startup\s+)?([A-Z][a-zA-Z0-9\s.-]+?)\s+(?:raises|secures|bags|closes|nabs|lands)/i)
      if (raisesMatch && raisesMatch[1]) {
        companyName = raisesMatch[1].trim()
      } else {
        const titleParts = rawTitle.split(/[-–—|:]/)
        if (titleParts.length > 0) {
          companyName = titleParts[0].trim().slice(0, 30)
        }
      }

      // Infer clean domain guess from company name (e.g. "StepSecurity" -> "stepsecurity.io" or ".com")
      const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, "")
      const domainGuess = cleanName ? `${cleanName}.com` : undefined

      items.push({
        companyName,
        fundingAmount,
        round,
        headline: rawTitle,
        articleUrl,
        domain: domainGuess,
        publishedAt,
      })
    }

    return items
  } catch (error) {
    console.error("fetchLiveFundingFeed error:", error)
    return []
  }
}

/**
 * Verifies live DNS MX records for a company domain to ensure outreach emails won't bounce.
 * Identifies the mail provider (Google Workspace, Microsoft 365, etc.) and tests candidate patterns.
 */
export async function verifyDomainMx(
  domain: string,
  founderName = "Founder"
): Promise<MxVerificationResult> {
  const cleanDomain = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase()

  let hasLiveMx = false
  let topExchange: string | null = null
  let provider: MxVerificationResult["provider"] = "None"

  try {
    const records = await dns.resolveMx(cleanDomain)
    if (records && records.length > 0) {
      records.sort((a, b) => a.priority - b.priority)
      hasLiveMx = true
      topExchange = records[0].exchange.toLowerCase()

      if (topExchange.includes("google") || topExchange.includes("googlemail") || topExchange.includes("aspmx")) {
        provider = "Google Workspace"
      } else if (topExchange.includes("outlook") || topExchange.includes("protection.outlook.com") || topExchange.includes("microsoft")) {
        provider = "Microsoft 365"
      } else if (topExchange.includes("protonmail") || topExchange.includes("proton.ch")) {
        provider = "ProtonMail"
      } else if (topExchange.includes("zoho")) {
        provider = "Zoho"
      } else {
        provider = "Custom / Other"
      }
    }
  } catch {
    hasLiveMx = false
    topExchange = null
    provider = "None"
  }

  // Generate candidate email patterns based on the founder's name
  const nameParts = founderName.trim().toLowerCase().split(/\s+/)
  const firstName = nameParts[0]?.replace(/[^a-z]/g, "") || "founder"
  const lastName = nameParts[nameParts.length - 1]?.replace(/[^a-z]/g, "") || ""

  const candidates: string[] = []
  candidates.push(`${firstName}@${cleanDomain}`)
  if (lastName && lastName !== firstName) {
    candidates.push(`${firstName}.${lastName}@${cleanDomain}`)
    candidates.push(`${firstName}${lastName[0]}@${cleanDomain}`)
    candidates.push(`${firstName[0]}${lastName}@${cleanDomain}`)
  }

  // Optional: check public GitHub commits for domain and founder name
  let githubCommitEmail: string | null = null
  try {
    const ghUrl = `https://api.github.com/search/commits?q=${encodeURIComponent(cleanDomain)}+author-name:${encodeURIComponent(firstName)}&per_page=3`
    const ghRes = await fetch(ghUrl, {
      headers: {
        "User-Agent": "Musketeers-Lead-Scout",
        Accept: "application/vnd.github.cloak-preview+json",
      },
      signal: AbortSignal.timeout(3000),
    })
    if (ghRes.ok) {
      const ghData = await ghRes.json()
      const commitItems = ghData.items || []
      for (const item of commitItems) {
        const email = item?.commit?.author?.email
        if (email && typeof email === "string" && email.includes(`@${cleanDomain}`) && !email.includes("noreply")) {
          githubCommitEmail = email.toLowerCase()
          break
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return {
    domain: cleanDomain,
    hasLiveMx,
    topExchange,
    provider,
    recommendedEmail: githubCommitEmail || candidates[0],
    fallbackEmails: candidates.slice(1),
    githubCommitEmail,
  }
}

/**
 * Builds a clean Google / DuckDuckGo LinkedIn X-Ray search query
 * that bypasses LinkedIn login walls.
 */
export function buildLinkedInXRayUrl(
  companyName: string,
  role = "Founder OR Co-Founder OR CTO OR 'VP Engineering'"
): string {
  const cleanCompany = companyName.replace(/["']/g, "").trim()
  const rawQuery = `site:linkedin.com/in "${cleanCompany}" (${role})`
  const encodedQuery = encodeURIComponent(rawQuery)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")

  return `https://duckduckgo.com/?q=${encodedQuery}`
}
