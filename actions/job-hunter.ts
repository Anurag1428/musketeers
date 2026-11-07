"use server"

import * as dns from "node:dns/promises"
import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import { and, desc, eq } from "drizzle-orm"
import { google } from "@ai-sdk/google"
import { generateObject } from "ai"
import { z } from "zod"
import { getDaytonaClient } from "@/lib/daytona"
import {
  executeDesktopCommand,
  isDesktopConfigured,
  openDesktopBrowser,
} from "@/lib/desktop-agent"
import {
  bots,
  insertStartupLeadSchema,
  startupLeads,
  type StartupLead,
} from "@/lib/db/schema"
import { RADAR_PRESETS, type RadarPresetId } from "@/lib/job-hunter-constants"
import { getDb } from "@/lib/neon-db"
import {
  isFirecrawlConfigured,
  scrapeWebpage,
  searchFounderLinkedIn,
  searchWeb,
} from "@/lib/firecrawl"

export type { RadarPresetId }

export type TimeframeOption = "7d" | "48h" | "30d" | "all"

export interface SweepFundingParams {
  presetId?: RadarPresetId
  customUrl?: string
  timeframe?: TimeframeOption
  includeRumours?: boolean
  limit?: number
  botId?: string
  botContainerName?: string
  sandboxId?: string | null
}

export interface SweepFundingResult {
  success: boolean
  presetTitle: string
  leads: StartupLead[]
  error?: string
}

/**
 * Grabs the RSS feed using curl inside the bot's container/workstation,
 * with network fetch fallback if needed.
 */
async function fetchFundingRss(url: string, sandboxId?: string | null): Promise<string> {
  // Try workstation curl on DISPLAY=:0 first
  if (isDesktopConfigured() || sandboxId === "desktop" || !sandboxId) {
    try {
      const curlRes = await executeDesktopCommand(
        `curl -s -L --max-time 15 --compressed "${url}"`
      )
      if (curlRes.stdout && curlRes.stdout.trim().length > 100) {
        return curlRes.stdout
      }
    } catch (e) {
      console.warn("Desktop curl failed, attempting fallback:", e)
    }
  } else if (sandboxId) {
    try {
      const daytona = getDaytonaClient()
      const sandbox = await daytona.get(sandboxId)
      const res = await sandbox.process.executeCommand(
        `curl -s -L --max-time 15 --compressed "${url}"`
      )
      if (res.result && res.result.trim().length > 100) {
        return res.result
      }
    } catch (e) {
      console.warn("Sandbox curl failed, attempting fallback:", e)
    }
  }

  // Safe fallback to fetch
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch RSS feed (${res.status} ${res.statusText})`)
  }
  return res.text()
}

/**
 * Verifies live MX records using node:dns/promises and workstation nslookup.
 */
async function verifyDomainMx(cleanDomain: string): Promise<boolean> {
  try {
    const mxRecords = await dns.resolveMx(cleanDomain)
    if (mxRecords && mxRecords.length > 0) {
      return true
    }
  } catch {}

  try {
    const nsRes = await executeDesktopCommand(`nslookup -type=mx ${cleanDomain}`).catch(
      () => ({ exitCode: 1, stdout: "", stderr: "" })
    )
    if (
      nsRes.stdout &&
      (nsRes.stdout.includes("mail exchanger") || nsRes.stdout.includes("MX"))
    ) {
      return true
    }
  } catch {}

  return false
}

/**
 * Searches GitHub public commits API for real developer/founder emails on domain.
 */
async function searchGithubCommitEmail(
  cleanDomain: string,
  firstName: string
): Promise<string | null> {
  try {
    const ghRes = await fetch(
      `https://api.github.com/search/commits?q=${encodeURIComponent(cleanDomain)}+author-name:${encodeURIComponent(firstName)}`,
      {
        headers: {
          Accept: "application/vnd.github.cloak-preview+json",
          "User-Agent": "Musketeers-JobHunter/1.0",
        },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (ghRes.ok) {
      const ghData = await ghRes.json()
      if (ghData.items && Array.isArray(ghData.items)) {
        for (const item of ghData.items) {
          const authorEmail = item.commit?.author?.email
          if (
            authorEmail &&
            authorEmail.toLowerCase().includes(cleanDomain.toLowerCase())
          ) {
            return authorEmail.toLowerCase()
          }
        }
      }
    }
  } catch {}
  return null
}

const extractedStartupsSchema = z.object({
  startups: z
    .array(
      z.object({
        startupName: z
          .string()
          .describe("Clean company name ONLY, e.g. 'Athena', 'Brava' (NO category in parentheses)"),
        domain: z
          .string()
          .describe(
            "The startup's OWN official company website domain without http/www (e.g., 'athena.ai', 'brava.security', 'clark.ai'). CRITICAL: NEVER use news publisher domains like siliconangle.com, calcalistech.com, unite.ai, or techcrunch.com."
          ),
        fundingRound: z
          .string()
          .describe("Round name (e.g., 'Seed', 'Series A', '$21M Series A')"),
        fundingAmount: z
          .string()
          .describe("Amount raised (e.g., '$10M', '$4.5M', 'Undisclosed')"),
        founderName: z
          .string()
          .describe(
            "A real individual human name (e.g. 'Michael Zhang'). If unknown from article, provide the known founder or 'Founder'. NEVER use group descriptions like 'Unit 8200 and Microsoft Veterans' or 'Founding Team'."
          ),
        founderRole: z
          .string()
          .describe("Founder role (e.g., 'Founder & CEO', 'Co-Founder & CTO')"),
        summary: z
          .string()
          .describe("One sentence on what the startup builds"),
        announcedDate: z
          .string()
          .describe("Approximate announcement timeframe, e.g. '2 days ago', 'Yesterday', 'This week', 'Nov 4, 2026'"),
        isRumoured: z
          .boolean()
          .describe("True if rumoured, leaking, or in talks to raise; false if formally announced"),
        sourceArticleUrl: z
          .string()
          .optional()
          .describe("URL of the news source or announcement"),
        linkedinNote: z
          .string()
          .describe(
            "Authentic, compelling LinkedIn connection note under 280 characters referencing their round and AI/full-stack engineering skills"
          ),
        emailSubject: z
          .string()
          .describe(
            "Direct 5-8 word email subject line referencing their funding round"
          ),
        emailBody: z
          .string()
          .describe(
            "Personalized 3-4 sentence cold email to the founder congratulating them on the round, pitching full-stack AI value, and asking for a short chat"
          ),
      })
    )
    .min(1)
    .max(25)
    .describe("Extracted funded startups with outreach drafts"),
})

/**
 * Stage 1 to Stage 4 core logic: Free Funding Radar -> X-Ray Discovery -> Email Verifier -> Outreach Drafts.
 * Callable from server actions and Trigger.dev background tasks.
 */
export async function executeFundingSweep(
  params: SweepFundingParams & { userId: string }
): Promise<SweepFundingResult> {
  const { userId } = params
  const db = getDb()

  // Resolve target bot ID
  let botId = params.botId
  if (!botId) {
    const [firstBot] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.userId, userId))
      .limit(1)
    if (!firstBot) {
      throw new Error("No bot found. Please create a bot first.")
    }
    botId = firstBot.id
  }

  const selectedPreset =
    RADAR_PRESETS.find((p) => p.id === params.presetId) || RADAR_PRESETS[0]
  const targetFeedUrl = params.customUrl?.trim() || selectedPreset.url

  // Stage 1: Funding Radar - Firecrawl primary, RSS fallback
  let cleanSnippet = ""
  const currentYear = new Date().getFullYear()
  const timeframe = params.timeframe || "7d"
  const tbs =
    timeframe === "48h"
      ? "qdr:d"
      : timeframe === "7d"
      ? "qdr:w"
      : timeframe === "30d"
      ? "qdr:m"
      : undefined

  if (isFirecrawlConfigured()) {
    try {
      const customInput = params.customUrl?.trim()
      const fundingTerms =
        params.includeRumours !== false
          ? '("raises" OR "raised" OR "in talks to raise" OR "secures" OR "pre-seed" OR "seed" OR "Series A" OR "funding")'
          : '("raises" OR "raised" OR "secures" OR "seed" OR "Series A" OR "funding")'

      const searchQueries: string[] = []

      if (customInput && !customInput.startsWith("http")) {
        // User typed a custom search query / topic
        searchQueries.push(`${customInput} ${fundingTerms} ${currentYear}`)
        searchQueries.push(`${customInput} funding announcement ${currentYear}`)
      } else if (
        customInput &&
        customInput.startsWith("http") &&
        !customInput.includes("/feed") &&
        !customInput.includes("/rss") &&
        !customInput.includes("news.google.com")
      ) {
        // User pasted a specific article URL - scrape it directly
        const scraped = await scrapeWebpage(customInput)
        if (scraped.success && scraped.markdown) {
          cleanSnippet = scraped.markdown.slice(0, 25000)
        }
      } else {
        // Run multi-faceted searches in parallel to discover dozens of fresh funding deals
        searchQueries.push(`${selectedPreset.label} ${fundingTerms} ${currentYear}`)
        searchQueries.push(`tech startup ("seed" OR "Series A" OR "in talks to raise" OR "secures") funding ${currentYear}`)
        searchQueries.push(`site:techcrunch.com/category/venture OR site:prnewswire.com startup raises ${currentYear}`)
      }

      if (!cleanSnippet && searchQueries.length > 0) {
        const queryPromises = searchQueries.map((q) =>
          searchWeb(q, { limit: 10, tbs }).catch(() => null)
        )
        const allSearchResults = await Promise.all(queryPromises)

        const combinedItems: { title: string; description?: string; url: string }[] = []
        const seenUrls = new Set<string>()

        for (const res of allSearchResults) {
          if (res && res.success && res.results) {
            for (const item of res.results) {
              if (item.url && !seenUrls.has(item.url)) {
                seenUrls.add(item.url)
                combinedItems.push(item)
              }
            }
          }
        }

        if (combinedItems.length > 0) {
          cleanSnippet = combinedItems
            .slice(0, 30)
            .map(
              (r) =>
                `HEADLINE: ${r.title}\nSNIPPET: ${r.description || ""}\nURL: ${r.url}`
            )
            .join("\n\n")
          console.log(
            `[job-hunter] Stage 1: Firecrawl combined ${combinedItems.length} unique results across ${searchQueries.length} queries (tbs: ${tbs})`
          )
        }
      }
    } catch (e) {
      console.warn("[job-hunter] Firecrawl search failed, falling back to RSS:", e)
    }
  }

  // Fallback: RSS feed
  if (!cleanSnippet) {
    const rssXml = await fetchFundingRss(targetFeedUrl, params.sandboxId)
    if (!rssXml || rssXml.trim().length < 50) {
      return {
        success: false,
        presetTitle: selectedPreset.label,
        leads: [],
        error: "Could not retrieve funding data (Firecrawl unavailable, RSS also failed)",
      }
    }
    cleanSnippet = rssXml
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<content:encoded>[\s\S]*?<\/content:encoded>/g, "")
      .slice(0, 25000)
    console.log("[job-hunter] Stage 1: RSS fallback used")
  }

  // Stage 2 & 4: Extract startups and craft personalized outreach with Gemini
  const timeframeDesc =
    timeframe === "48h"
      ? "the last 48 hours / yesterday"
      : timeframe === "30d"
      ? "the last 30 days"
      : "the last 5 to 7 days / past week"

  const requestedCount = Math.min(params.limit || 8, 15)

  const prompt = [
    `You are an elite Funded Startup Radar & Executive Job Hunter assistant.`,
    `Current reference date: ${new Date().toISOString().split("T")[0]} (${currentYear}).`,
    `Analyze this recent startup funding and rumor news data:`,
    cleanSnippet,
    ``,
    `Extract up to ${requestedCount} recently funded or rumoured tech startups that announced funding within ${timeframeDesc}.`,
    `CRITICAL EXTRACTION RULES:`,
    `1. STRICT TIMEFRAME: The funding or rumor MUST have been announced/reported within ${timeframeDesc} (${currentYear}). DO NOT include startups from older months or past years unless explicitly asked.`,
    `2. RUMORS & IN TALKS: If an item discusses a startup 'in talks to raise', 'expected to raise', or 'seeking a round', include it and set isRumoured to true. If confirmed/closed, set isRumoured to false.`,
    `3. ANNOUNCED DATE: Set announcedDate to approximate timing (e.g. '2 days ago', 'Yesterday', 'This week', or exact date).`,
    `4. STARTUP NAME: Output the clean company name ONLY (e.g. 'Athena' instead of 'Athena (legal ai)').`,
    `5. REAL COMPANY DOMAIN: The domain MUST be the startup's OWN product/company website (e.g. 'athena.ai', 'brava.security', 'clark.ai', '42ai.com'). NEVER use news publisher domains like siliconangle.com, calcalistech.com, unite.ai, theaiinsider.tech, corporatecomplianceinsights.com, techcrunch.com, or prnewswire.com. If the article doesn't explicitly state their domain, provide their actual real company domain.`,
    `6. REAL INDIVIDUAL NAME: 'founderName' MUST be a real individual human name (e.g. 'Dan Smith'). NEVER use phrases, qualifications, or group descriptions like 'Unit 8200 and Microsoft Veterans' or 'Founding Team'.`,
    `7. CRISP PRODUCT SUMMARY: 'summary' MUST be one clean, professional sentence explaining what the company builds in plain English (e.g. 'AI-native legal operating system for venture-backed startups and legal teams'). NEVER include raw website markdown, login form text, or image tags.`,
    `8. HIGH-CONVERTING OUTREACH: Write an authentic <280-character LinkedIn note and a crisp 3-4 sentence cold email congratulating them on this round/momentum and pitching AI/full-stack engineering skills.`,
  ].join("\n")

  const { object } = await generateObject({
    model: google("gemini-3.5-flash-lite"),
    schema: extractedStartupsSchema,
    prompt,
  })

  const savedLeads: StartupLead[] = []

  for (const startup of object.startups) {
    const cleanDomain = startup.domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim()

    // Stage 2: Discover verified founder and direct LinkedIn profile
    let linkedinXrayUrl = `https://www.google.com/search?q=${encodeURIComponent(
      `site:linkedin.com/in "${startup.startupName}" ("Founder" OR "Co-founder" OR "CTO")`
    )}`
    let founderName = startup.founderName.trim()
    let founderRole = startup.founderRole.trim()

    if (isFirecrawlConfigured()) {
      try {
        const fcProfiles = await searchFounderLinkedIn(startup.startupName)
        if (fcProfiles.success && fcProfiles.profiles.length > 0) {
          const topProfile = fcProfiles.profiles[0]
          linkedinXrayUrl = topProfile.linkedinUrl
          if (topProfile.name && topProfile.name !== "Founder") {
            founderName = topProfile.name
          }
          if (topProfile.role) {
            founderRole = topProfile.role
          }
        }
      } catch (err) {
        console.warn("Firecrawl founder lookup fallback:", err)
      }
    }

    // Stage 2b: Optional - scrape company homepage for product context
    let productContext = ""
    if (isFirecrawlConfigured()) {
      try {
        const scraped = await scrapeWebpage(`https://${cleanDomain}`)
        if (scraped.success && scraped.markdown) {
          // Pull first 1200 chars of homepage markdown as product context
          productContext = scraped.markdown.trim().slice(0, 1200)
        }
      } catch (_) {
        // scrape is best-effort, ignore errors
      }
    }

    // Stage 3: Live DNS MX Verification + Email Finder
    const mxVerified = await verifyDomainMx(cleanDomain)

    // Clean founder name from honorifics and punctuation
    const cleanFounderName = founderName
      .replace(/\b(MD|PhD|MBA|M\.D\.|Ph\.D\.|Dr\.|Prof\.)\b/gi, "")
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    const nameParts = cleanFounderName.split(/\s+/).filter(Boolean)
    const firstName = nameParts[0]?.toLowerCase() || "founder"
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : ""

    let candidateEmail = `${firstName}@${cleanDomain}`
    if (lastName && lastName.length > 1) {
      candidateEmail = `${firstName}.${lastName}@${cleanDomain}`
    }

    const githubEmail = await searchGithubCommitEmail(cleanDomain, firstName)
    const verifiedEmail = githubEmail || candidateEmail

    // Enforce < 280 chars for LinkedIn note
    let linkedinNote = startup.linkedinNote.trim()
    if (linkedinNote.length > 275) {
      linkedinNote = `${linkedinNote.slice(0, 272)}...`
    }

    // Crisp, clean product summary (prefer Gemini's concise summary, otherwise sanitize scraped text)
    let cleanProductSummary = startup.summary?.trim() || ""
    if (
      !cleanProductSummary ||
      cleanProductSummary.includes("## Login") ||
      cleanProductSummary.includes("![](")
    ) {
      if (productContext) {
        cleanProductSummary = productContext
          .replace(/!\[.*?\]\(.*?\)/g, "") // strip image embeds
          .replace(/\[.*?\]\(.*?\)/g, "") // strip markdown links
          .replace(/[#*`_~]/g, "")
          .replace(/## Login.*/gi, "")
          .replace(/\s+/g, " ")
          .slice(0, 180)
          .trim()
      }
    }

    // Server-side validation using insertStartupLeadSchema
    const validatedData = insertStartupLeadSchema.parse({
      userId,
      botId,
      startupName: startup.startupName.trim(),
      domain: cleanDomain,
      fundingRound: startup.fundingRound.trim(),
      fundingAmount: startup.fundingAmount.trim(),
      founderName,
      founderRole,
      verifiedEmail,
      mxVerified,
      linkedinXrayUrl,
      linkedinNote,
      emailSubject: startup.emailSubject.trim(),
      emailBody: startup.emailBody.trim(),
      announcedDate: startup.announcedDate || "This week",
      productSummary: cleanProductSummary || startup.startupName,
      sourceArticleUrl: startup.sourceArticleUrl || "",
      isRumoured: Boolean(startup.isRumoured),
    })

    const [inserted] = await db
      .insert(startupLeads)
      .values(validatedData)
      .returning()

    savedLeads.push(inserted)
  }

  // Open the first startup's LinkedIn X-Ray search on Desktop Chromium (DISPLAY=:0) live!
  if (savedLeads.length > 0 && isDesktopConfigured()) {
    try {
      await openDesktopBrowser(savedLeads[0].linkedinXrayUrl)
      await executeDesktopCommand(
        "wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
      )
    } catch (e) {
      console.warn("Could not focus desktop browser:", e)
    }
  }

  revalidatePath("/chats")

  return {
    success: true,
    presetTitle: selectedPreset.label,
    leads: savedLeads,
  }
}

/**
 * Server action for UI forms: authenticates session and triggers executeFundingSweep.
 */
export async function sweepFundingStartups(
  params: SweepFundingParams
): Promise<SweepFundingResult> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  return executeFundingSweep({ ...params, userId })
}

/**
 * Opens a lead's LinkedIn X-Ray Google query in Chromium on the desktop monitor.
 */
export async function openLeadInDesktopBrowser(linkedinXrayUrl: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const targetUrl = linkedinXrayUrl.startsWith("http")
    ? linkedinXrayUrl
    : `https://${linkedinXrayUrl}`

  const res = await openDesktopBrowser(targetUrl)
  await executeDesktopCommand(
    "wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
  ).catch(() => {})

  return { success: true, url: targetUrl, snapshot: res.snapshot }
}

/**
 * Retrieves saved startup leads for the user and/or active bot.
 */
export async function getStartupLeads(botId?: string): Promise<StartupLead[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()
  const conditions = [eq(startupLeads.userId, userId)]
  if (botId) {
    conditions.push(eq(startupLeads.botId, botId))
  }

  return db
    .select()
    .from(startupLeads)
    .where(and(...conditions))
    .orderBy(desc(startupLeads.createdAt))
    .limit(50)
}

/**
 * Deletes a saved startup lead.
 */
export async function deleteStartupLead(leadId: string): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()
  await db
    .delete(startupLeads)
    .where(and(eq(startupLeads.id, leadId), eq(startupLeads.userId, userId)))

  revalidatePath("/chats")
  return true
}
