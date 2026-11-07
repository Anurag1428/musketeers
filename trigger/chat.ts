import * as dns from "node:dns/promises"
import {
  fetchLiveFundingFeed,
  verifyDomainMx,
  buildLinkedInXRayUrl,
} from "@/lib/funding-hunter"
import { chat } from "@trigger.dev/sdk/ai"
import { google } from "@ai-sdk/google"
import { tool, isStepCount } from "ai"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { bots, chatMembers, chats } from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"
import { getDaytonaClient } from "@/lib/daytona"
import {
  executeSandboxBrowserCommand,
  executeDesktopBrowserCommand,
} from "@/lib/browser-agent"
import {
  executeFundingSweep,
} from "@/actions/job-hunter"
import {
  scrapeWebpage,
  searchWeb,
  searchFounderLinkedIn,
  isFirecrawlConfigured,
} from "@/lib/firecrawl"
import {
  isDesktopConfigured,
  executeDesktopCommand,
  openDesktopBrowser,
  takeDesktopScreenshot,
  desktopMouseClick,
  desktopMouseMove,
  desktopMouseScroll,
  desktopKeyboardType,
  desktopKeyboardPress,
  desktopReadFile,
  desktopWriteFile,
  desktopListFiles,
} from "@/lib/desktop-agent"

export const clientDataSchema = z.object({
  botName: z.string().optional(),
  botJob: z.string().optional(),
  botInstructions: z.string().nullable().optional(),
  sandboxId: z.string().nullable().optional(),
  selectedBotId: z.string().optional(),
})

export type ChatClientData = z.infer<typeof clientDataSchema>

export interface GroupBotInfo {
  id: string
  name: string
  job: string
  instructions?: string | null
}

export function buildAgentInstructions(params: {
  name?: string | null
  job?: string | null
  purpose?: string | null
  sandboxId?: string | null
  isGroup?: boolean
  chatName?: string | null
  otherBots?: GroupBotInfo[]
}): string {
  const name = params.name?.trim() || "Assistant"
  const job = params.job?.trim() || "AI Assistant"
  const purpose =
    params.purpose?.trim() ||
    "Assist the user with their requests in a helpful, accurate, and professional manner."

  const isPhysical =
    params.sandboxId === "desktop" ||
    (!params.sandboxId && isDesktopConfigured())
  const hasEnv = Boolean(params.sandboxId?.trim() || isDesktopConfigured())

  const now = new Date()
  const localTimeString = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    timeZoneName: "short",
  })

  const sandboxInfo = isPhysical
    ? `You are connected directly to your dedicated Ubuntu Desktop workstation (Acer Veriton at 192.168.1.12:5000). You have native control over its bash shell, Chromium browser, mouse, keyboard, and screen.`
    : params.sandboxId?.trim()
      ? `You are connected to an isolated Daytona cloud sandbox environment (Sandbox ID: ${params.sandboxId.trim()}).`
      : `You are running in a cloud environment without a provisioned sandbox.`

  const memoryGuidance = hasEnv
    ? [
        `# Persistent Memory Management (Memory.md)`,
        isPhysical
          ? `You have a dedicated persistent memory file at \`/home/anurag/Memory.md\` located on your Ubuntu desktop filesystem.`
          : `You have a dedicated persistent memory file at \`Memory.md\` located in your sandbox root filesystem.`,
        `This file is your long-term memory. It is tied to your desktop/sandbox and persists across ALL conversations, including:`,
        `- Private 1:1 direct chats with the user`,
        `- Group chats with the user and other bots`,
        ``,
        `### Core Goal: Cross-Chat Memory Continuity`,
        `Your primary memory goal is cross-chat recall: remember facts, user preferences, personal details, project requirements, past instructions, and decisions made in private 1:1 chats, even when asked about them in group chats with other bots (or vice versa).`,
        ``,
        `### When to Reference (Read) \`Memory.md\`:`,
        `- Proactively check your memory using \`read_file(path="Memory.md")\` whenever:`,
        `  1. The user asks a question about previous interactions, personal background, preferences, or project history (e.g. "Do you remember...", "What are my preferences?", "What did we decide about...", "Who am I?").`,
        `  2. IN GROUP CHATS: When the user or a teammate bot asks you about something that might have been discussed previously in private 1:1 chats or earlier sessions. ALWAYS call \`read_file(path="Memory.md")\` to recall this context and answer accurately based on your persistent memory.`,
        `  3. Starting any task where personalizing your response based on past user preferences or prior instructions produces a higher-quality result.`,
        ``,
        `### When to Write / Update \`Memory.md\`:`,
        `- Update your memory using \`write_file(path="Memory.md", content=...)\` whenever:`,
        `  1. IN PRIVATE 1:1 CHATS: The user mentions important personal facts, preferences, background, constraints, project context, or explicit instructions that should be retained long-term.`,
        `  2. IN GROUP CHATS: Significant new facts, requirements, or decisions relevant to you or the user are established.`,
        `- Safe Memory Update Procedure:`,
        `  1. Call \`read_file(path="Memory.md")\` to inspect existing memories.`,
        `  2. Merge the new information while PRESERVING all previous memories (never overwrite or wipe out existing memories unless the user explicitly asks you to update or remove a specific memory).`,
        `  3. Keep the file structured, clean, and concise using Markdown headings and bullet points (e.g., "# User Profile & Preferences", "# Projects & Objectives", "# Key Decisions & Notes").`,
        `  4. Write the complete updated content back using \`write_file(path="Memory.md", content=...)\`.`,
      ].join("\n")
    : ""

  const computerUseGuidance = [
    `# Web Browsing, Research & Desktop Automation Protocol`,
    `- TIER 1 (Fast Web Scraping & Research - DEFAULT): For reading websites, articles, company landing pages, checking team/about pages, or searching the web, ALWAYS use \`web_scrape\`, \`web_search\`, and \`find_founder_linkedin\` first. These tools bypass Cloudflare and anti-bot screens, returning clean Markdown in 1 step without opening an interactive browser or wasting steps.`,
    hasEnv
      ? `- TIER 2 (Direct-UI Desktop Automation - Actions Only): You also have full desktop control on Linux (DISPLAY=:0) with Chrome DevTools Protocol (CDP port 9222). Use \`open_browser\`, \`browser_click\`, and desktop tools when you need to interact with local apps, perform actions in an authenticated session (e.g. sending a message), or when the user specifically asks to see the browser window via \`show_screen\`.`
      : "",
    hasEnv
      ? [
          ``,
          `### Authentic Direct-UI Navigation Protocol (When using the Desktop Browser):`,
          `- AUTHENTIC UI NAVIGATION RULE: When asked to interact with a specific platform (such as Wellfound, LinkedIn, Apollo, GitHub, etc.) on the desktop, stay on that website and operate its actual UI controls using \`browser_click(ref)\` and \`browser_fill(ref, text)\`.`,
          `- DROPDOWN & FILTER LOOP: Clicking a dropdown or filter button opens a menu in the DOM. Call \`browser_snapshot\` after clicking a dropdown trigger to see the newly rendered menu options, then call \`browser_click\` on the desired option.`,
          `- LOGIN / CAPTCHA HANDOFF: If \`browser_snapshot\` shows a Sign-In wall or Cloudflare challenge blocking the website, call \`show_screen\` and tell the user in chat: "Please log into [Site] on the live desktop monitor on the right, then reply Done so I can continue."`,
          `- PERSISTENT PROFILES: Your Chromium browser runs with a persistent profile. Any site you or the user log into remains permanently saved across tasks.`,
          `- ZERO HALLUCINATION POLICY: NEVER invent or mock data. Every single contact MUST come from verified profiles on the target platform.`,
        ].join("\n")
      : "",
    ``,
    `### Funded-Startup & Lead Scout Pipeline:`,
    `- When tasked with finding funded startups, company leads, or executive contacts:`,
    `  1. STRICT RECENCY ENFORCEMENT: The user explicitly requires freshly announced or rumoured startups from the LAST 5 TO 7 DAYS (past week) or LAST 48 HOURS. NEVER provide older startups from past months or years unless explicitly requested. Always pass timeframe="7d" (or "48h").`,
    `  2. RUMOURED / IN TALKS: If the user asks for rumoured or expected raises, actively search for startups 'in talks to raise', 'expected to close round', or 'seeking funding' in the past week alongside confirmed rounds.`,
    `  3. DELIBERATE FULL INTEL: When asked deliberately for complete info on any startup, call \`get_startup_full_intel(companyName)\` to fetch everything: product overview, tech stack, funding timeline, real founder LinkedIn URLs, and deliverable email.`,
    `  4. SWEEP: Call \`sweep_funded_startups\` with timeframe="7d" to fetch real companies that announced Seed, Series A, or venture rounds in the past week from live funding feeds.`,
    `  5. X-RAY RADAR: For each target startup, call \`find_founder_linkedin(companyName)\` to instantly retrieve real founder/CTO names, titles, and direct LinkedIn profile URLs without CAPTCHA blocks. If visual browser display on screen is needed, call \`search_linkedin_xray(companyName)\`.`,
    `  6. COMPANY INTEL: Call \`web_scrape(domain)\` to read their real product offerings, tech stack, and careers page in 1 step.`,
    `  7. DELIVERABILITY CHECK: Call \`verify_founder_email(domain, founderName)\` to run real DNS MX lookups (Google Workspace, Microsoft 365) and check public GitHub commits so emails never bounce.`,
    `  8. PERSIST LEADS: Append all verified contacts to \`leads.csv\` via \`write_file(path="leads.csv", content=...)\`.`,
    `  9. VOICE & CARDS: Output clean conversational cards (### 🏢 Company — Funding Amount, * **Announced:** Timeframe [Confirmed / Rumour], * **Founder:** Name (Title), * **Email:** verified@domain [MX Verified], * **Outreach Pitch:** ...). Call \`show_screen\` to show the desktop preview if requested.`,
    `- STAGE 3 (File Storage): Save all genuine leads into \`leads.csv\` using \`write_file\`.`,
    `- STAGE 4 (Audible & User-Friendly Presentation): NEVER output raw wide Markdown pipe tables (| col | col |) — they sound atrocious when read aloud by voice synthesis. Instead, lead with a natural 1-2 sentence spoken executive summary, followed by clean visual cards (### 🏢 Company Name, * **Lead:** Name — Title, * **Email:** ..., * **LinkedIn:** ...). Call \`show_screen\` to display your browser screen to the user.`,
  ]
    .filter(Boolean)
    .join("\n")

  let directChatGuidance = ""
  if (!params.isGroup) {
    directChatGuidance = [
      `# Private 1:1 Chat Context`,
      `You are in a direct 1:1 conversation with the user as **${name}** (Role: ${job}).`,
      `- Pay close attention to what the user shares regarding their preferences, background, ongoing work, and specific instructions.`,
      `- Proactively record meaningful information in \`Memory.md\` using \`write_file\` so you will remember it in future private chats and in group chats.`,
    ].join("\n")
  }

  let groupChatGuidance = ""
  if (params.isGroup) {
    const chatTitle = params.chatName?.trim() || "Group Chat"
    const teammates = (params.otherBots || [])
      .map(
        (b) =>
          `- **${b.name}** — Role: ${b.job}${
            b.instructions
              ? ` | Specialty: ${b.instructions.slice(0, 200)}`
              : ""
          }`
      )
      .join("\n")

    const otherBotNames = (params.otherBots || []).map((b) => b.name).join(", ")

    groupChatGuidance = [
      `# Group Chat Context`,
      `You are a member of the group chat "${chatTitle}".`,
      `You are currently responding as **${name}** (Role: ${job}). Always stay in your own persona.`,
      teammates
        ? `\nOther participating bots in this group chat:\n${teammates}`
        : "",
      ``,
      `# Memory Recall & Proactive Handoff in Group Chat`,
      `- Remember that your \`Memory.md\` file contains notes, preferences, and facts learned from your private 1:1 chats with the user.`,
      `- When asked about personal user details (such as names, pets, dog's name, preferences, background, past private discussions, or tasks), ALWAYS check your \`Memory.md\` via \`read_file(path="Memory.md")\` first.`,
      `- CRITICAL: If you check your \`Memory.md\` and DO NOT find the answer, NEVER just say you don't know or ask the user to tell you again! You are in a group chat with teammates (${otherBotNames || "other bots"}) who may have learned this in their private 1:1 direct chats with the user!`,
      `- Therefore, if the memory is not in your file, IMMEDIATELY call the \`handoff\` tool to transfer the turn to a teammate bot (e.g. ${otherBotNames || "a teammate"}) so they can check their memory and answer the user. State in your response that you checked your memory, didn't find it, and are handing off to that teammate who may have the memory!`,
      `- If you were just handed this conversation from another bot and also do not find the answer in your Memory.md, do NOT call handoff again. Simply inform the user directly that you also checked your memory and could not find the information.`,
      ``,
      `# Collaboration & Handoff Guidance`,
      `- You have access to the \`handoff\` tool in this group chat.`,
      `- If a user prompt, question, or task falls outside your role (${job}) or purpose, or is clearly better suited for one of your teammates above, invoke the \`handoff\` tool to transfer the task to that bot.`,
      `- When calling \`handoff\`, provide the teammate bot's name and a clear explanation of why they are the right specialist for the request.`,
      `- After the \`handoff\` tool runs, tell the user in your message that you have handed the task over to that bot and briefly explain why, inviting them to continue with that teammate.`,
      `- If the user's prompt matches your expertise or is general enough for you to handle, answer it directly without calling \`handoff\`.`,
    ].join("\n")
  }

  return [
    `# Identity & Role`,
    `You are ${name}.`,
    `Your job is: ${job}.`,
    ``,
    `# Real-Time & Temporal Grounding`,
    `- Current Date and Time: ${localTimeString} (ISO: ${now.toISOString()}).`,
    `- You always know the exact current time, day, and date. When asked "What time is it?", "What is today's date?", or "What day is today?", answer immediately, concisely, and accurately without needing to invoke bash or terminal tools.`,
    ``,
    `# Conversational Voice Persona (JARVIS)`,
    `- Tone: Calm, sharp, witty, concise, and respectful (addressing the user as "sir" or by their name if recorded in Memory.md).`,
    `- Conversational Spoken Answers: When the user asks a question, ALWAYS lead with a natural, crisp 1-3 sentence spoken executive answer (suitable for text-to-speech synthesis).`,
    `- Separate Spoken Summary from In-Depth Details: If the user's question requires extensive research, reports, data tables, or code snippets, DO NOT make your spoken opening an endless read-out. Deliver the concise conversational answer first, and then organize all comprehensive research, data tables, or links under clear Markdown sections below. This allows the user to hear the immediate direct answer aloud while having complete technical documentation visually on screen.`,
    ``,
    `# Purpose`,
    purpose,
    ``,
    `# Environment`,
    sandboxInfo,
    memoryGuidance ? `\n${memoryGuidance}` : "",
    computerUseGuidance ? `\n${computerUseGuidance}` : "",
    params.isGroup
      ? groupChatGuidance
        ? `\n${groupChatGuidance}`
        : ""
      : directChatGuidance
        ? `\n${directChatGuidance}`
        : "",
    ``,
    `Always respond in character according to your role and purpose. Maintain a helpful and professional demeanor.`,
  ].join("\n")
}

async function getBotById(botId: string) {
  try {
    const db = getDb()
    const rows = await db.select().from(bots).where(eq(bots.id, botId)).limit(1)

    return rows[0] ?? null
  } catch (error) {
    console.error("Failed to query bot by id from database:", error)
    return null
  }
}

async function getChatBots(chatId: string): Promise<{
  chat: typeof chats.$inferSelect | null
  bots: (typeof bots.$inferSelect)[]
}> {
  try {
    const db = getDb()
    const [chatRows, memberRows] = await Promise.all([
      db.select().from(chats).where(eq(chats.id, chatId)).limit(1),
      db
        .select({ bot: bots })
        .from(chatMembers)
        .innerJoin(bots, eq(chatMembers.botId, bots.id))
        .where(eq(chatMembers.chatId, chatId)),
    ])

    return {
      chat: chatRows[0] ?? null,
      bots: memberRows.map((r) => r.bot),
    }
  } catch (error) {
    console.error("Failed to query chat bots from database:", error)
    return { chat: null, bots: [] }
  }
}

async function getBotByChatId(chatId: string) {
  const { bots: chatBots } = await getChatBots(chatId)
  return chatBots[0] ?? null
}

function makeHandoffTool(
  memberBots: (typeof bots.$inferSelect)[],
  currentBotId?: string
) {
  const eligibleBots = currentBotId
    ? memberBots.filter((b) => b.id !== currentBotId)
    : memberBots

  const botDescriptions = (eligibleBots.length > 0 ? eligibleBots : memberBots)
    .map(
      (b) =>
        `• Name: "${b.name}" (ID: "${b.id}") | Role: ${b.job}${
          b.instructions ? ` | Specialty: ${b.instructions.slice(0, 150)}` : ""
        }`
    )
    .join("\n")

  return tool({
    description: `Transfer or hand off the user's task to another bot in this group chat who specializes in the required topic.
Use this tool when the user's request falls outside your domain or is better suited for a teammate.
Available teammate bots:
${botDescriptions}`,
    inputSchema: z.object({
      targetBot: z
        .string()
        .describe(
          "The exact name or ID of the bot to hand off to from the available teammate bots list"
        ),
      reason: z
        .string()
        .describe(
          "Clear explanation of why this bot is better suited to handle the user's prompt"
        ),
    }),
    execute: async ({ targetBot, reason }) => {
      const cleanTarget = targetBot.trim().toLowerCase()
      const target = memberBots.find(
        (b) =>
          b.id.toLowerCase() === cleanTarget ||
          b.name.toLowerCase() === cleanTarget ||
          b.name.toLowerCase().includes(cleanTarget) ||
          cleanTarget.includes(b.name.toLowerCase())
      )

      if (!target) {
        return {
          success: false,
          error: `Bot "${targetBot}" not found in this group chat. Available bots are: ${memberBots
            .map((b) => b.name)
            .join(", ")}.`,
        }
      }

      if (currentBotId && target.id === currentBotId) {
        return {
          success: false,
          error: `You are already ${target.name}. Hand off to another member bot if needed, or answer directly.`,
        }
      }

      return {
        success: true,
        targetBotId: target.id,
        targetBotName: target.name,
        targetBotAvatar: target.avatar,
        targetBotJob: target.job,
        reason,
        message: `Successfully handed off to ${target.name} (${target.job}).`,
      }
    },
  })
}

/**
 * Retrieves a Daytona sandbox and ensures it is started and ready.
 * Ensures the X virtual display server (Xvfb, xfce4, x11vnc) is active on DISPLAY=:0.
 * Also ensures Memory.md exists in the sandbox.
 */
async function getActiveSandbox(sandboxId: string) {
  const daytona = getDaytonaClient()
  const sandbox = await daytona.get(sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  try {
    const status = await sandbox.computerUse.getStatus()
    if (status.status !== "active") {
      await sandbox.computerUse.start()
    }
  } catch (error) {
    console.warn("Could not start computerUse desktop processes:", error)
  }

  // Ensure Memory.md file exists in the sandbox root
  try {
    await sandbox.fs.getFileDetails("Memory.md")
  } catch {
    try {
      await sandbox.fs.uploadFile(Buffer.from(""), "Memory.md")
    } catch (e) {
      console.warn("Could not ensure Memory.md exists in sandbox:", e)
    }
  }

  return sandbox
}

/**
 * Creates tools powered by Firecrawl for fast, 1-step web scraping and search.
 * Works independently of any physical desktop or sandbox.
 */
function makeFirecrawlTools() {
  return {
    web_scrape: tool({
      description:
        "Fast, 1-step web scraper powered by Firecrawl. Automatically extracts clean Markdown from any website URL, bypassing Cloudflare, CAPTCHAs, and anti-bot protections. Use this as your primary tool to read web pages, company about/careers pages, and articles without needing a browser window.",
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            "The URL to scrape (e.g. 'https://example.com' or 'example.com/about')"
          ),
      }),
      execute: async ({ url }: { url: string }) => {
        return scrapeWebpage(url)
      },
    }),

    web_search: tool({
      description:
        "Live web search powered by Firecrawl. Searches the web and returns clean text results, links, and content without CAPTCHAs. Use this to find news, funding announcements, or company information in 1 step. Defaults to fresh results from the past week.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        timeframe: z
          .enum(["48h", "7d", "30d", "all"])
          .default("7d")
          .describe("Timeframe filter. Default '7d' (past 5-7 days / past week). Use '48h' for yesterday/today."),
        limit: z
          .number()
          .default(5)
          .describe("Maximum number of results to return (default: 5)"),
      }),
      execute: async ({
        query,
        timeframe,
        limit,
      }: {
        query: string
        timeframe?: "48h" | "7d" | "30d" | "all"
        limit?: number
      }) => {
        const tbs =
          timeframe === "48h"
            ? "qdr:d"
            : timeframe === "7d" || !timeframe
            ? "qdr:w"
            : timeframe === "30d"
            ? "qdr:m"
            : undefined
        return searchWeb(query, { limit: limit ?? 5, tbs })
      },
    }),

    get_startup_full_intel: tool({
      description:
        "Fetches comprehensive 360-degree intelligence on any startup: official domain, what the product does (via Firecrawl scrape), all discovered founders & executive LinkedIn profiles, funding history/rumours, and predicted deliverable email contacts.",
      inputSchema: z.object({
        companyName: z.string().describe("Name of the company or startup (e.g. 'OpenRouter', 'StepSecurity', 'Cognition')"),
        domain: z.string().optional().describe("Known domain if available (e.g. 'openrouter.ai')"),
      }),
      execute: async ({ companyName, domain }: { companyName: string; domain?: string }) => {
        let cleanDomain = domain
          ? domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim()
          : ""

        // 1. Resolve domain if not given
        if (!cleanDomain) {
          const search = await searchWeb(`${companyName} official website`, { limit: 3 })
          if (search.success && search.results.length > 0) {
            const firstValid = search.results.find((r) => !r.url.includes("linkedin.com") && !r.url.includes("wikipedia.org"))
            if (firstValid) {
              cleanDomain = firstValid.url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim()
            }
          }
        }

        // 2. Scrape product & company overview
        let productSummary = ""
        if (cleanDomain) {
          try {
            const scraped = await scrapeWebpage(`https://${cleanDomain}`)
            if (scraped.success && scraped.markdown) {
              productSummary = scraped.markdown.slice(0, 1500)
            }
          } catch (_) {}
        }

        // 3. Find key founders and leadership
        const founderLookup = await searchFounderLinkedIn(companyName)
        const profiles = founderLookup.success ? founderLookup.profiles : []

        // 4. Recent funding or rumors
        const news = await searchWeb(`${companyName} (funding OR round OR raises OR seed OR "series A") 2026`, { limit: 4, tbs: "qdr:m" })

        return {
          companyName,
          domain: cleanDomain,
          productSummary: productSummary || "Could not scrape product description directly.",
          founders: profiles,
          recentFundingNews: news.success ? news.results.map((r) => ({ title: r.title, url: r.url, snippet: r.description })) : [],
          recommendedOutreachAngle: `Congratulate on recent momentum and pitch AI / full-stack engineering scalability.`,
        }
      },
    }),

    find_founder_linkedin: tool({
      description:
        "Finds real LinkedIn profile URLs for founders, co-founders, or executive leadership of a specific company via Firecrawl anti-bot search. Returns the exact LinkedIn URLs, names, and titles without Google CAPTCHAs.",
      inputSchema: z.object({
        companyName: z
          .string()
          .describe(
            "Company or startup name, e.g. 'Athena' or 'StepSecurity'"
          ),
        role: z
          .string()
          .optional()
          .describe("Optional specific role filter (e.g. 'CTO' or 'CEO')"),
      }),
      execute: async ({
        companyName,
        role,
      }: {
        companyName: string
        role?: string
      }) => {
        return searchFounderLinkedIn(
          companyName,
          role ? `("${role}")` : undefined
        )
      },
    }),
  }
}

/**
 * Creates all computer-use and filesystem tools bound to a specific Daytona sandbox.
 * All tools are server-side only — they run in Trigger.dev, never in the browser.
 */
function makeSandboxTools(sandboxId: string, userId?: string, botId?: string) {
  return {
    open_browser: tool({
      description:
        "Open the Chromium web browser on the desktop to a specific URL. Automatically returns the accessibility DOM snapshot with @eN element references for immediate browser_click and browser_fill.",
      inputSchema: z.object({
        url: z
          .string()
          .default("https://wellfound.com/jobs")
          .describe("URL to navigate to"),
      }),
      execute: async ({ url }: { url: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const targetUrl = url.startsWith("http") ? url : `https://${url}`
        const profileDir = "/tmp/jarvis-chrome-profile"

        // Check if Chromium is already active with port 9222 listening in sandbox
        const cdpCheck = await sandbox.process
          .executeCommand(
            "curl -s --connect-timeout 1 http://127.0.0.1:9222/json/version"
          )
          .catch(() => ({ exitCode: 1, result: "" }))

        let navigatedExisting = false
        if (
          cdpCheck.exitCode === 0 &&
          (cdpCheck.result || "").includes("Browser")
        ) {
          const navRes = await executeSandboxBrowserCommand(
            sandbox,
            `open "${targetUrl}"`
          )
          if (navRes.success) {
            navigatedExisting = true
          }
        }

        if (!navigatedExisting) {
          // Kill any stale non-CDP Chromium instance
          await sandbox.process
            .executeCommand("pkill -f chromium 2>/dev/null || true")
            .catch(() => {})

          // Remove any stale SingletonLock only when Chromium is not running on port 9222
          await sandbox.process
            .executeCommand(
              `mkdir -p "${profileDir}" && rm -f "${profileDir}/SingletonLock" "${profileDir}/SingletonSocket" "${profileDir}/SingletonCookie" 2>/dev/null || true`
            )
            .catch(() => {})

          await sandbox.process.executeCommand(
            `export DISPLAY=:0; nohup chromium --no-sandbox --start-maximized --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-infobars --disable-fre --disable-search-engine-choice-screen --user-data-dir="${profileDir}" --remote-debugging-port=9222 "${targetUrl}" </dev/null >/dev/null 2>&1 &`
          )
        }

        // Give the window 2.2 seconds to render on screen
        await new Promise((res) => setTimeout(res, 2200))

        // Auto-return the accessibility DOM snapshot so the model gets @eN element refs on Step 1
        const snapRes = await executeSandboxBrowserCommand(
          sandbox,
          "snapshot -i"
        )
        return {
          success: true,
          url: targetUrl,
          snapshot: snapRes.output || "Interactive elements tree ready.",
          instruction:
            "Use browser_click and browser_fill with the @eN refs above to interact with this page. NEVER use mouse_click.",
        }
      },
    }),
    browser_snapshot: tool({
      description:
        "Take an accessibility/DOM snapshot of the current Chromium web page. Returns an interactive tree of elements with reference IDs (e.g. @e1, @e2, @e3). Call this after open_browser or after any click to inspect exact element refs.",
      inputSchema: z.object({}),
      execute: async () => {
        const sandbox = await getActiveSandbox(sandboxId)
        const res = await executeSandboxBrowserCommand(sandbox, "snapshot -i")
        return {
          snapshot: res.output || "No interactive elements found",
          instruction:
            "Use the @eN refs from this snapshot with browser_click or browser_fill.",
        }
      },
    }),

    browser_click: tool({
      description:
        "Click an element in the Chromium browser using its exact reference ID from browser_snapshot (e.g. '@e3'). 100% reliable.",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e3')"),
      }),
      execute: async ({ ref }: { ref: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const res = await executeSandboxBrowserCommand(
          sandbox,
          `click "${ref}"`
        )
        return { success: res.success, output: res.output, error: res.error }
      },
    }),

    browser_fill: tool({
      description:
        "Clear and fill text into an input or textarea element by its reference ID from browser_snapshot (e.g. '@e2').",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e2')"),
        text: z.string().describe("Text to fill into the input"),
      }),
      execute: async ({ ref, text }: { ref: string; text: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const escaped = text.replace(/"/g, '\\"')
        const res = await executeSandboxBrowserCommand(
          sandbox,
          `fill "${ref}" "${escaped}"`
        )
        return { success: res.success, output: res.output, error: res.error }
      },
    }),

    browser_press: tool({
      description:
        "Press a key (e.g. 'Enter', 'Tab', 'Escape') in the browser.",
      inputSchema: z.object({
        key: z
          .string()
          .describe("Key name to press, e.g. 'Enter', 'Tab', 'Escape'"),
      }),
      execute: async ({ key }: { key: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const res = await executeSandboxBrowserCommand(
          sandbox,
          `press "${key}"`
        )
        return { success: res.success, output: res.output }
      },
    }),

    browser_get_text: tool({
      description:
        "Extract the text content of a specific element by ref from browser_snapshot.",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e1')"),
      }),
      execute: async ({ ref }: { ref: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const res = await executeSandboxBrowserCommand(
          sandbox,
          `get text "${ref}"`
        )
        return { text: res.output }
      },
    }),

    sweep_funded_startups: tool({
      description:
        "Sweeps live funding news for real startups that announced Seed, Series A, or venture rounds recently (strictly within the specified timeframe, default 5-7 days / past week). Uses Firecrawl web search (primary) for rich, accurate results, falling back to RSS feeds. Returns company names, funding amounts, headlines, domains, and article URLs.",
      inputSchema: z.object({
        query: z
          .string()
          .default("AI startup raises Seed OR 'Series A' OR 'in talks to raise' funding 2026")
          .describe("Search query for funded startups (e.g. 'AI startup raises Seed funding 2026' or 'India startup Series A 2026')"),
        timeframe: z
          .enum(["48h", "7d", "30d"])
          .default("7d")
          .describe("Recency window. Default '7d' (past 5-7 days / past week). Use '48h' for yesterday/today."),
        includeRumours: z
          .boolean()
          .default(true)
          .describe("Include rumoured, leaking, or in-talks raises alongside confirmed rounds."),
        limit: z
          .number()
          .default(5)
          .describe("Max number of startups to return (default: 5)"),
      }),
      execute: async ({
        query,
        timeframe = "7d",
        includeRumours = true,
        limit = 5,
      }: {
        query: string
        timeframe?: "48h" | "7d" | "30d"
        includeRumours?: boolean
        limit?: number
      }) => {
        // Preferred: Full end-to-end radar with verified founders and outreach drafts
        if (userId) {
          try {
            const sweepRes = await executeFundingSweep({
              customUrl: query,
              timeframe,
              includeRumours,
              limit,
              userId,
              botId,
            })
            if (sweepRes.success && sweepRes.leads.length > 0) {
              return {
                count: sweepRes.leads.length,
                source: "firecrawl",
                timeframe,
                startups: sweepRes.leads,
                instruction: `Found ${sweepRes.leads.length} fresh startups with verified founders and outreach drafts. Tell the user warmly about the results and let the interactive cards display the details.`,
              }
            }
          } catch (e) {
            console.warn("executeFundingSweep failed, falling back to raw search:", e)
          }
        }

        const tbs =
          timeframe === "48h" ? "qdr:d" : timeframe === "7d" ? "qdr:w" : "qdr:m"

        // Primary: Firecrawl web search - richer article content, no CAPTCHA
        if (isFirecrawlConfigured()) {
          try {
            const finalQuery = includeRumours && !query.includes("in talks")
              ? `${query} OR "in talks to raise"`
              : query
            const fcRes = await searchWeb(finalQuery, { limit, tbs })
            if (fcRes.success && fcRes.results.length > 0) {
              return {
                count: fcRes.results.length,
                source: "firecrawl",
                timeframe,
                startups: fcRes.results.map((r) => ({
                  headline: r.title,
                  articleUrl: r.url,
                  description: r.description || r.markdown?.slice(0, 300),
                })),
                instruction:
                  "Found recent funding news from the past week. Now for each startup: 1) call find_founder_linkedin(companyName) to get real founder profiles, 2) call web_scrape(domain) to read their product details, 3) call verify_founder_email(domain, founderName) to confirm email deliverability.",
              }
            }
          } catch (e) {
            console.warn("Firecrawl sweep failed, falling back to RSS:", e)
          }
        }
        // Fallback: RSS
        const startups = await fetchLiveFundingFeed(query)
        return {
          count: startups.length,
          source: "rss",
          timeframe,
          startups,
          instruction:
            "Found recently funded startups from RSS. Now for each: 1) call find_founder_linkedin(companyName), 2) call web_scrape(domain) to read their product details, 3) call verify_founder_email(domain, founderName).",
        }
      },
    }),

    search_linkedin_xray: tool({
      description:
        "Opens Google LinkedIn X-Ray search on Chromium (DISPLAY=:0) inside the sandbox to find founders, co-founders, or CTOs for a specific startup. Also queries Firecrawl in parallel for verified profile URLs.",
      inputSchema: z.object({
        companyName: z.string().describe("Target startup name (e.g. 'Athena AI' or 'Perplexity')"),
        role: z
          .string()
          .default("Founder OR Co-Founder OR CTO")
          .describe("Target role filter, e.g. 'Founder OR CTO' or 'HR OR Recruiter'"),
      }),
      execute: async ({
        companyName,
        role,
      }: {
        companyName: string
        role: string
      }) => {
        const xrayUrl = buildLinkedInXRayUrl(companyName, role)
        const profileDir = "/tmp/jarvis-chrome-profile"
        const sandbox = await getActiveSandbox(sandboxId)

        const cdpCheck = await sandbox.process
          .executeCommand(
            "curl -s --connect-timeout 1 http://127.0.0.1:9222/json/version"
          )
          .catch(() => ({ exitCode: 1, result: "" }))

        let navigatedExisting = false
        if (
          cdpCheck.exitCode === 0 &&
          (cdpCheck.result || "").includes("Browser")
        ) {
          const navRes = await executeSandboxBrowserCommand(
            sandbox,
            `open "${xrayUrl}"`
          )
          if (navRes.success) {
            navigatedExisting = true
          }
        }

        if (!navigatedExisting) {
          await sandbox.process
            .executeCommand("pkill -f chromium 2>/dev/null || true")
            .catch(() => {})
          await sandbox.process
            .executeCommand(
              `mkdir -p "${profileDir}" && rm -f "${profileDir}/SingletonLock" "${profileDir}/SingletonSocket" "${profileDir}/SingletonCookie" 2>/dev/null || true`
            )
            .catch(() => {})
          await sandbox.process.executeCommand(
            `export DISPLAY=:0; nohup chromium --no-sandbox --test-type --disable-infobars --start-maximized --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-search-engine-choice-screen --user-data-dir="${profileDir}" --remote-debugging-port=9222 "${xrayUrl}" </dev/null >/dev/null 2>&1 &`
          )
        }

        await sandbox.process
          .executeCommand(
            "export DISPLAY=:0; wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
          )
          .catch(() => {})

        await new Promise((res) => setTimeout(res, 2200))
        const snapRes = await executeSandboxBrowserCommand(sandbox, "snapshot -i")

        let verifiedProfiles = undefined
        if (isFirecrawlConfigured()) {
          try {
            const fcRes = await searchFounderLinkedIn(companyName, role ? `("${role}")` : undefined)
            if (fcRes.success && fcRes.profiles.length > 0) {
              verifiedProfiles = fcRes.profiles
            }
          } catch {}
        }

        return {
          success: true,
          companyName,
          xrayUrl,
          verifiedProfiles,
          snapshot: snapRes.output,
          instruction:
            "Opened LinkedIn X-Ray search on Chromium (DISPLAY=:0). Verified founder profiles are provided above. You can also inspect the desktop snapshot or click a result using browser_click.",
        }
      },
    }),

    open_funding_or_xray_in_chromium: tool({
      description:
        "Launches Chromium on DISPLAY=:0 inside your bot's container with the TechCrunch/Inc42 funding page or Google LinkedIn X-Ray search, then brings the window to focus with wmctrl -a Chromium.",
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            "URL to open in Chromium (e.g. Google LinkedIn X-Ray query or funding article)"
          ),
      }),
      execute: async ({ url }: { url: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const targetUrl = url.startsWith("http") ? url : `https://${url}`
        const profileDir = "/tmp/jarvis-chrome-profile"

        const cdpCheck = await sandbox.process
          .executeCommand(
            "curl -s --connect-timeout 1 http://127.0.0.1:9222/json/version"
          )
          .catch(() => ({ exitCode: 1, result: "" }))

        let navigatedExisting = false
        if (
          cdpCheck.exitCode === 0 &&
          (cdpCheck.result || "").includes("Browser")
        ) {
          const navRes = await executeSandboxBrowserCommand(
            sandbox,
            `open "${targetUrl}"`
          )
          if (navRes.success) {
            navigatedExisting = true
          }
        }

        if (!navigatedExisting) {
          await sandbox.process
            .executeCommand("pkill -f chromium 2>/dev/null || true")
            .catch(() => {})
          await sandbox.process
            .executeCommand(
              `mkdir -p "${profileDir}" && rm -f "${profileDir}/SingletonLock" "${profileDir}/SingletonSocket" "${profileDir}/SingletonCookie" 2>/dev/null || true`
            )
            .catch(() => {})
          await sandbox.process.executeCommand(
            `export DISPLAY=:0; nohup chromium --no-sandbox --test-type --disable-infobars --start-maximized --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-search-engine-choice-screen --user-data-dir="${profileDir}" --remote-debugging-port=9222 "${targetUrl}" </dev/null >/dev/null 2>&1 &`
          )
        }

        await sandbox.process
          .executeCommand(
            "export DISPLAY=:0; wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
          )
          .catch(() => {})

        await new Promise((res) => setTimeout(res, 2000))
        const snapRes = await executeSandboxBrowserCommand(sandbox, "snapshot -i")
        return {
          success: true,
          url: targetUrl,
          snapshot: snapRes.output,
          instruction:
            "Opened Chromium on DISPLAY=:0 and focused the window in the container.",
        }
      },
    }),

    verify_founder_email: tool({
      description:
        "Runs real-time DNS MX lookups (Google Workspace, Microsoft 365) and queries public GitHub commits so your bot never recommends an invalid or bouncing email.",
      inputSchema: z.object({
        domain: z.string().describe("The startup domain name, e.g. 'stepsecurity.io' or 'linear.app'"),
        founderName: z
          .string()
          .default("Founder")
          .describe("The founder or decision maker's name, e.g. 'Varun Sharma'"),
      }),
      execute: async ({
        domain,
        founderName,
      }: {
        domain: string
        founderName: string
      }) => {
        const result = await verifyDomainMx(domain, founderName)
        return {
          domain: result.domain,
          founderName,
          mxVerified: result.hasLiveMx,
          topExchange: result.topExchange,
          provider: result.provider,
          recommendedEmail: result.recommendedEmail,
          fallbackEmails: result.fallbackEmails,
          githubCommitEmail: result.githubCommitEmail,
          status: result.hasLiveMx
            ? `Domain active with live ${result.provider} mail servers (${result.topExchange})`
            : "No MX records found for domain",
        }
      },
    }),

    bash: tool({
      description:
        "Execute a shell command in the sandbox and return its output. Use for running scripts, installing packages, or any terminal operation.",
      inputSchema: z.object({
        command: z.string().describe("The shell command to run"),
      }),
      execute: async ({ command }: { command: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        // Ensure DISPLAY is exported for GUI processes
        const fullCommand = `export DISPLAY=:0; ${command}`
        const response = await sandbox.process.executeCommand(fullCommand)
        return {
          stdout: response.result,
          exitCode: response.exitCode,
        }
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a file from the sandbox filesystem and return them as a string. Use path 'Memory.md' to read your persistent long-term memory file.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
      }),
      execute: async ({ path }: { path: string }) => {
        try {
          const sandbox = await getActiveSandbox(sandboxId)
          const buffer = await sandbox.fs.downloadFile(path)
          return { content: buffer.toString("utf-8"), path, success: true }
        } catch (error: any) {
          if (path === "Memory.md" || path.endsWith("/Memory.md")) {
            try {
              const sandbox = await getActiveSandbox(sandboxId)
              await sandbox.fs.uploadFile(Buffer.from(""), path)
              return {
                content: "",
                path,
                success: true,
                note: "Memory.md was blank/uninitialized.",
              }
            } catch {}
          }
          return {
            content: "",
            path,
            success: false,
            error: error?.message || "Failed to read file",
          }
        }
      },
    }),

    write_file: tool({
      description:
        "Write text content to a file in the sandbox filesystem. Creates or overwrites the file. Use path 'Memory.md' to record or update your persistent long-term memory across chats.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
        content: z.string().describe("The text content to write"),
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), path)
        return { success: true, path }
      },
    }),

    list_files: tool({
      description:
        "List files and directories in a given path inside the sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Directory path to list. Defaults to the working directory")
          .default("."),
      }),
      execute: async ({ path }: { path: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const files = await sandbox.fs.listFiles(path)
        return {
          path,
          entries: files.map((f) => ({
            name: f.name,
            isDir: f.isDir,
            size: f.size,
          })),
        }
      },
    }),

    mouse_click: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For all web pages, dropdowns, filters, and inputs, ALWAYS use browser_click, browser_fill, and browser_press with @eN refs.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        button: z
          .enum(["left", "right", "middle"])
          .default("left")
          .describe("Mouse button"),
        double: z.boolean().default(false).describe("Whether to double-click"),
      }),
      execute: async ({
        x,
        y,
        button,
        double: isDouble,
      }: {
        x: number
        y: number
        button: "left" | "right" | "middle"
        double: boolean
      }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const result = await sandbox.computerUse.mouse.click(
          x,
          y,
          button,
          isDouble
        )
        return { x, y, button, double: isDouble, result }
      },
    }),

    mouse_move: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For all web pages, dropdowns, filters, and inputs, ALWAYS use browser_click, browser_fill, and browser_press with @eN refs.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
      }),
      execute: async ({ x, y }: { x: number; y: number }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const result = await sandbox.computerUse.mouse.move(x, y)
        return { x: result.x, y: result.y }
      },
    }),

    mouse_scroll: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For scrolling web pages, use browser_press with 'Page_Down' or 'Page_Up', or browser_scroll.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate to scroll at"),
        y: z.number().describe("Y coordinate to scroll at"),
        direction: z.enum(["up", "down"]).describe("Scroll direction"),
        amount: z.number().default(3).describe("Number of scroll steps"),
      }),
      execute: async ({
        x,
        y,
        direction,
        amount,
      }: {
        x: number
        y: number
        direction: "up" | "down"
        amount: number
      }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const success = await sandbox.computerUse.mouse.scroll(
          x,
          y,
          direction,
          amount
        )
        return { x, y, direction, amount, success }
      },
    }),

    keyboard_type: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For typing into web forms and search bars, ALWAYS use browser_fill with the @eN ref.",
      inputSchema: z.object({
        text: z.string().describe("Text to type"),
      }),
      execute: async ({ text }: { text: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        await sandbox.computerUse.keyboard.type(text)
        return { typed: text }
      },
    }),

    keyboard_press: tool({
      description:
        "Press a key or key combination (e.g. 'enter', 'escape', 'ctrl+c', 'super').",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Key to press. Canonical names include 'enter', 'escape', 'tab', 'super', letters, or hotkeys like 'ctrl+c'."
          ),
        modifiers: z
          .array(z.enum(["ctrl", "alt", "shift", "cmd"]))
          .default([])
          .describe("Optional modifier keys"),
      }),
      execute: async ({
        key,
        modifiers,
      }: {
        key: string
        modifiers: Array<"ctrl" | "alt" | "shift" | "cmd">
      }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        if (modifiers.length > 0) {
          await sandbox.computerUse.keyboard.press(key, modifiers)
        } else {
          await sandbox.computerUse.keyboard.press(key)
        }
        return { key, modifiers }
      },
    }),

    /**
     * view_screen — Silent observation tool.
     * The agent uses this to see the sandbox screen without showing the screenshot to the user.
     * Uses toModelOutput so the multimodal model visually sees the screenshot.
     */
    view_screen: tool({
      description:
        "Take a screenshot of the sandbox desktop to observe the current visual state. Returns the visual image of the screen so you can inspect where to click or type. The screenshot is not shown to the user.",
      inputSchema: z.object({}),
      execute: async (_args: Record<string, never>) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const screenshot = await sandbox.computerUse.screenshot.takeFullScreen()
        return {
          base64: screenshot.screenshot ?? "",
          mediaType: "image/png" as const,
        }
      },
      toModelOutput: ({ output }: any) => ({
        type: "content",
        value: [
          {
            type: "file",
            mediaType: "image/png",
            data: {
              type: "data",
              data: output.base64,
            },
          },
        ],
      }),
    }),

    /**
     * show_screen — User-facing screenshot tool.
     * The agent uses this when the user explicitly asks to see the screen.
     * The UI renders the screenshot image inline in chat.
     */
    show_screen: tool({
      description:
        "Take a screenshot of the sandbox desktop and display it directly to the user in the chat. Call this whenever you finish a browsing or desktop task, or whenever the user asks for a screenshot or to see the screen.",
      inputSchema: z.object({}),
      execute: async (_args: Record<string, never>) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const screenshot = await sandbox.computerUse.screenshot.takeFullScreen()
        return {
          base64: screenshot.screenshot ?? "",
          mediaType: "image/png" as const,
        }
      },
      toModelOutput: ({ output }: any) => ({
        type: "content",
        value: [
          {
            type: "file",
            mediaType: "image/png",
            data: {
              type: "data",
              data: output.base64,
            },
          },
        ],
      }),
    }),
  }
}

/**
 * Creates all computer-use and filesystem tools bound to the physical Ubuntu desktop (Acer Veriton).
 * Executes commands natively over the local network via HTTP listener.
 */
function makeDesktopTools(userId?: string, botId?: string) {
  return {
    open_browser: tool({
      description:
        "Open the Chromium web browser on the physical Ubuntu desktop to a specific URL. Automatically returns the accessibility DOM snapshot with @eN element references for immediate browser_click and browser_fill.",
      inputSchema: z.object({
        url: z
          .string()
          .default("https://wellfound.com/jobs")
          .describe("URL to navigate to"),
      }),
      execute: async ({ url }: { url: string }) => {
        return openDesktopBrowser(url)
      },
    }),
    browser_snapshot: tool({
      description:
        "Take an accessibility/DOM snapshot of the current Chromium web page. Returns an interactive tree of elements with reference IDs (e.g. @e1, @e2, @e3). Call this after open_browser or after any click to inspect exact element refs.",
      inputSchema: z.object({}),
      execute: async () => {
        const res = await executeDesktopBrowserCommand("snapshot -i")
        return {
          snapshot: res.output || "No interactive elements found",
          instruction:
            "Use the @eN refs from this snapshot with browser_click or browser_fill.",
        }
      },
    }),

    browser_click: tool({
      description:
        "Click an element in the Chromium browser using its exact reference ID from browser_snapshot (e.g. '@e3'). 100% reliable.",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e3')"),
      }),
      execute: async ({ ref }: { ref: string }) => {
        const res = await executeDesktopBrowserCommand(`click "${ref}"`)
        return { success: res.success, output: res.output, error: res.error }
      },
    }),

    browser_fill: tool({
      description:
        "Clear and fill text into an input or textarea element by its reference ID from browser_snapshot (e.g. '@e2').",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e2')"),
        text: z.string().describe("Text to fill into the input"),
      }),
      execute: async ({ ref, text }: { ref: string; text: string }) => {
        const escaped = text.replace(/"/g, '\\"')
        const res = await executeDesktopBrowserCommand(
          `fill "${ref}" "${escaped}"`
        )
        return { success: res.success, output: res.output, error: res.error }
      },
    }),

    browser_press: tool({
      description:
        "Press a key (e.g. 'Enter', 'Tab', 'Escape') in the browser.",
      inputSchema: z.object({
        key: z
          .string()
          .describe("Key name to press, e.g. 'Enter', 'Tab', 'Escape'"),
      }),
      execute: async ({ key }: { key: string }) => {
        const res = await executeDesktopBrowserCommand(`press "${key}"`)
        return { success: res.success, output: res.output }
      },
    }),

    browser_get_text: tool({
      description:
        "Extract the text content of a specific element by ref from browser_snapshot.",
      inputSchema: z.object({
        ref: z.string().describe("The element ref (e.g. '@e1')"),
      }),
      execute: async ({ ref }: { ref: string }) => {
        const res = await executeDesktopBrowserCommand(`get text "${ref}"`)
        return { text: res.output }
      },
    }),

    sweep_funded_startups: tool({
      description:
        "Sweeps live funding news for real startups that announced Seed, Series A, or venture rounds recently (strictly within the specified timeframe, default 5-7 days / past week). Uses Firecrawl web search (primary) for rich, accurate results, falling back to RSS feeds. Returns company names, funding amounts, headlines, domains, and article URLs.",
      inputSchema: z.object({
        query: z
          .string()
          .default("AI startup raises Seed OR 'Series A' OR 'in talks to raise' funding 2026")
          .describe("Search query for funded startups (e.g. 'AI startup raises Seed funding 2026' or 'India startup Series A 2026')"),
        timeframe: z
          .enum(["48h", "7d", "30d"])
          .default("7d")
          .describe("Recency window. Default '7d' (past 5-7 days / past week). Use '48h' for yesterday/today."),
        includeRumours: z
          .boolean()
          .default(true)
          .describe("Include rumoured, leaking, or in-talks raises alongside confirmed rounds."),
        limit: z
          .number()
          .default(5)
          .describe("Max number of startups to return (default: 5)"),
      }),
      execute: async ({
        query,
        timeframe = "7d",
        includeRumours = true,
        limit = 5,
      }: {
        query: string
        timeframe?: "48h" | "7d" | "30d"
        includeRumours?: boolean
        limit?: number
      }) => {
        // Preferred: Full end-to-end radar with verified founders and outreach drafts
        if (userId) {
          try {
            const sweepRes = await executeFundingSweep({
              customUrl: query,
              timeframe,
              includeRumours,
              limit,
              userId,
              botId,
            })
            if (sweepRes.success && sweepRes.leads.length > 0) {
              return {
                count: sweepRes.leads.length,
                source: "firecrawl",
                timeframe,
                startups: sweepRes.leads,
                instruction: `Found ${sweepRes.leads.length} fresh startups with verified founders and outreach drafts. Tell the user warmly about the results and let the interactive cards display the details.`,
              }
            }
          } catch (e) {
            console.warn("executeFundingSweep failed, falling back to raw search:", e)
          }
        }

        const tbs =
          timeframe === "48h" ? "qdr:d" : timeframe === "7d" ? "qdr:w" : "qdr:m"

        // Primary: Firecrawl web search - richer article content, no CAPTCHA
        if (isFirecrawlConfigured()) {
          try {
            const finalQuery = includeRumours && !query.includes("in talks")
              ? `${query} OR "in talks to raise"`
              : query
            const fcRes = await searchWeb(finalQuery, { limit, tbs })
            if (fcRes.success && fcRes.results.length > 0) {
              return {
                count: fcRes.results.length,
                source: "firecrawl",
                timeframe,
                startups: fcRes.results.map((r) => ({
                  headline: r.title,
                  articleUrl: r.url,
                  description: r.description || r.markdown?.slice(0, 300),
                })),
                instruction:
                  "Found recent funding news from the past week. Now for each startup: 1) call find_founder_linkedin(companyName) to get real founder profiles, 2) call web_scrape(domain) to read their product details, 3) call verify_founder_email(domain, founderName) to confirm email deliverability.",
              }
            }
          } catch (e) {
            console.warn("Firecrawl sweep failed, falling back to RSS:", e)
          }
        }
        // Fallback: RSS
        const startups = await fetchLiveFundingFeed(query)
        return {
          count: startups.length,
          source: "rss",
          timeframe,
          startups,
          instruction:
            "Found recently funded startups from RSS. Now for each: 1) call find_founder_linkedin(companyName), 2) call web_scrape(domain) to read their product details, 3) call verify_founder_email(domain, founderName).",
        }
      },
    }),

    search_linkedin_xray: tool({
      description:
        "Visually opens Chromium on DISPLAY=:0 with a targeted Google/DuckDuckGo LinkedIn X-Ray query to locate the Founder, Co-Founder, or CTO of a company without being blocked by LinkedIn login walls.",
      inputSchema: z.object({
        companyName: z.string().describe("Target company name, e.g. 'StepSecurity' or 'Composio'"),
        role: z
          .string()
          .default("Founder OR Co-Founder OR CTO")
          .describe("Target role filter, e.g. 'Founder OR CTO' or 'HR OR Recruiter'"),
      }),
      execute: async ({
        companyName,
        role,
      }: {
        companyName: string
        role: string
      }) => {
        const xrayUrl = buildLinkedInXRayUrl(companyName, role)
        const navRes = await openDesktopBrowser(xrayUrl)
        await executeDesktopCommand(
          "wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
        ).catch(() => {})

        let verifiedProfiles = undefined
        if (isFirecrawlConfigured()) {
          try {
            const fcRes = await searchFounderLinkedIn(companyName, role ? `("${role}")` : undefined)
            if (fcRes.success && fcRes.profiles.length > 0) {
              verifiedProfiles = fcRes.profiles
            }
          } catch {}
        }

        return {
          success: true,
          companyName,
          xrayUrl,
          verifiedProfiles,
          snapshot: navRes.snapshot,
          instruction:
            "Opened LinkedIn X-Ray search on Chromium (DISPLAY=:0). Verified founder profiles are provided above. You can also inspect the desktop snapshot or click a result using browser_click.",
        }
      },
    }),

    open_funding_or_xray_in_chromium: tool({
      description:
        "Launches Chromium on DISPLAY=:0 inside your bot's container with the TechCrunch/Inc42 funding page or Google LinkedIn X-Ray search, then brings the window to focus with wmctrl -a Chromium.",
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            "URL to open in Chromium (e.g. Google LinkedIn X-Ray query or funding article)"
          ),
      }),
      execute: async ({ url }: { url: string }) => {
        const targetUrl = url.startsWith("http") ? url : `https://${url}`
        const navRes = await openDesktopBrowser(targetUrl)
        await executeDesktopCommand(
          "wmctrl -a Chromium 2>/dev/null || wmctrl -a google-chrome 2>/dev/null || true"
        ).catch(() => {})
        return {
          success: true,
          url: targetUrl,
          snapshot: navRes.snapshot,
          instruction:
            "Opened Chromium on DISPLAY=:0 and focused the window. The user can view this live in their desktop preview.",
        }
      },
    }),

    verify_founder_email: tool({
      description:
        "Runs real-time DNS MX lookups (Google Workspace, Microsoft 365) and queries public GitHub commits so your bot never recommends an invalid or bouncing email.",
      inputSchema: z.object({
        domain: z.string().describe("The startup domain name, e.g. 'stepsecurity.io' or 'linear.app'"),
        founderName: z
          .string()
          .default("Founder")
          .describe("The founder or decision maker's name, e.g. 'Varun Sharma'"),
      }),
      execute: async ({
        domain,
        founderName,
      }: {
        domain: string
        founderName: string
      }) => {
        const result = await verifyDomainMx(domain, founderName)
        return {
          domain: result.domain,
          founderName,
          mxVerified: result.hasLiveMx,
          topExchange: result.topExchange,
          provider: result.provider,
          recommendedEmail: result.recommendedEmail,
          fallbackEmails: result.fallbackEmails,
          githubCommitEmail: result.githubCommitEmail,
          status: result.hasLiveMx
            ? `Domain active with live ${result.provider} mail servers (${result.topExchange})`
            : "No MX records found for domain",
        }
      },
    }),

    bash: tool({
      description:
        "Execute a shell command on the physical Ubuntu desktop and return its output. Use for running scripts, installing packages, or terminal operations.",
      inputSchema: z.object({
        command: z.string().describe("The shell command to run"),
      }),
      execute: async ({ command }: { command: string }) => {
        const res = await executeDesktopCommand(command)
        return {
          stdout: res.stdout,
          exitCode: res.exitCode,
        }
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a file from the desktop filesystem. Use path 'Memory.md' to read your persistent long-term memory file.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
      }),
      execute: async ({ path }: { path: string }) => {
        return desktopReadFile(path)
      },
    }),

    write_file: tool({
      description:
        "Write text content to a file on the desktop filesystem. Use path 'Memory.md' to record or update your persistent long-term memory across chats.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
        content: z.string().describe("The text content to write"),
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        return desktopWriteFile(path, content)
      },
    }),

    list_files: tool({
      description: "List files and directories in a given path on the desktop.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Directory path to list. Defaults to the home directory")
          .default("."),
      }),
      execute: async ({ path }: { path: string }) => {
        return desktopListFiles(path)
      },
    }),

    mouse_click: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For all web pages, dropdowns, filters, and inputs, ALWAYS use browser_click, browser_fill, and browser_press with @eN refs.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        button: z
          .enum(["left", "right", "middle"])
          .default("left")
          .describe("Mouse button"),
        double: z.boolean().default(false).describe("Whether to double-click"),
      }),
      execute: async ({ x, y, button, double }) => {
        return desktopMouseClick(x, y, button, double)
      },
    }),

    mouse_move: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For all web pages, dropdowns, filters, and inputs, ALWAYS use browser_click, browser_fill, and browser_press with @eN refs.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
      }),
      execute: async ({ x, y }: { x: number; y: number }) => {
        return desktopMouseMove(x, y)
      },
    }),

    mouse_scroll: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For scrolling web pages, use browser_press with 'Page_Down' or 'Page_Up', or browser_scroll.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate to scroll at"),
        y: z.number().describe("Y coordinate to scroll at"),
        direction: z.enum(["up", "down"]).describe("Scroll direction"),
        amount: z.number().default(3).describe("Number of scroll steps"),
      }),
      execute: async ({ x, y, direction, amount }) => {
        return desktopMouseScroll(x, y, direction, amount)
      },
    }),

    keyboard_type: tool({
      description:
        "NON-BROWSER LINUX DESKTOP FALLBACK ONLY — NEVER use this tool inside Chromium or on websites. For typing into web forms and search bars, ALWAYS use browser_fill with the @eN ref.",
      inputSchema: z.object({
        text: z.string().describe("Text to type"),
      }),
      execute: async ({ text }: { text: string }) => {
        return desktopKeyboardType(text)
      },
    }),

    keyboard_press: tool({
      description:
        "Press a key or key combination (e.g. 'enter', 'escape', 'ctrl+c', 'super').",
      inputSchema: z.object({
        key: z
          .string()
          .describe("Key to press (e.g. 'enter', 'escape', 'ctrl+c')."),
        modifiers: z
          .array(z.enum(["ctrl", "alt", "shift", "cmd"]))
          .default([])
          .describe("Optional modifier keys"),
      }),
      execute: async ({ key, modifiers }) => {
        return desktopKeyboardPress(key, modifiers)
      },
    }),

    view_screen: tool({
      description:
        "Take a screenshot of the physical Ubuntu desktop to observe the current visual state. Returns the visual image of the screen so you can inspect where to click or type. The screenshot is not shown to the user.",
      inputSchema: z.object({}),
      execute: async () => {
        return takeDesktopScreenshot()
      },
      toModelOutput: ({ output }: any) => ({
        type: "content",
        value: [
          {
            type: "file",
            mediaType: "image/png",
            data: {
              type: "data",
              data: output.base64,
            },
          },
        ],
      }),
    }),

    show_screen: tool({
      description:
        "Take a screenshot of the physical Ubuntu desktop and display it directly to the user in the chat. Call this whenever you finish a browsing or desktop task, or whenever the user asks for a screenshot or to see the screen.",
      inputSchema: z.object({}),
      execute: async () => {
        return takeDesktopScreenshot()
      },
      toModelOutput: ({ output }: any) => ({
        type: "content",
        value: [
          {
            type: "file",
            mediaType: "image/png",
            data: {
              type: "data",
              data: output.base64,
            },
          },
        ],
      }),
    }),
  }
}

export const chatAgent = chat.agent({
  id: "chat",
  clientDataSchema,
  tools: async ({ clientData, chatId }) => {
    const { chat: currentChat, bots: memberBots } = await getChatBots(chatId)

    let currentBotId = clientData?.selectedBotId
    let sandboxId = clientData?.sandboxId

    if (currentBotId) {
      const selectedBot =
        memberBots.find((b) => b.id === currentBotId) ||
        (await getBotById(currentBotId))
      if (selectedBot) {
        sandboxId = selectedBot.sandboxId
      }
    } else if (!sandboxId && memberBots.length > 0) {
      sandboxId = memberBots[0]?.sandboxId
      currentBotId = memberBots[0]?.id
    }

    const isPhysical =
      sandboxId === "desktop" ||
      (!sandboxId && isDesktopConfigured()) ||
      isDesktopConfigured()

    const firecrawlTools = makeFirecrawlTools()
    const sandboxTools = isPhysical
      ? makeDesktopTools(currentChat?.userId, currentBotId)
      : sandboxId
        ? makeSandboxTools(sandboxId, currentChat?.userId, currentBotId)
        : {}
    const baseTools = {
      ...firecrawlTools,
      ...sandboxTools,
    }
    const isGroup = currentChat?.kind === "group" || memberBots.length > 1

    if (isGroup && memberBots.length > 1) {
      return {
        ...baseTools,
        handoff: makeHandoffTool(memberBots, currentBotId),
      }
    }

    return baseTools
  },
  run: async ({ messages, signal, streamText, chatId, clientData, tools }) => {
    const { chat: currentChat, bots: memberBots } = await getChatBots(chatId)

    let name = clientData?.botName
    let job = clientData?.botJob
    let purpose = clientData?.botInstructions
    let sandboxId = clientData?.sandboxId
    let currentBotId = clientData?.selectedBotId

    // Support bot-per-turn in group chats via transport metadata
    if (currentBotId) {
      const selectedBot =
        memberBots.find((b) => b.id === currentBotId) ||
        (await getBotById(currentBotId))
      if (selectedBot) {
        name = selectedBot.name
        job = selectedBot.job
        purpose = selectedBot.instructions
        sandboxId = selectedBot.sandboxId
      }
    } else if (memberBots.length > 0) {
      const firstBot = memberBots[0]
      name = name || firstBot.name
      job = job || firstBot.job
      purpose = purpose ?? firstBot.instructions
      sandboxId = sandboxId ?? firstBot.sandboxId
      currentBotId = firstBot.id
    }

    const isGroup = currentChat?.kind === "group" || memberBots.length > 1
    const otherBots = isGroup
      ? memberBots
          .filter((b) => b.id !== currentBotId)
          .map((b) => ({
            id: b.id,
            name: b.name,
            job: b.job,
            instructions: b.instructions,
          }))
      : []

    const instructions = buildAgentInstructions({
      name,
      job,
      purpose,
      sandboxId,
      isGroup,
      chatName: currentChat?.name,
      otherBots,
    })

    chat.prompt.set(instructions)

    chat.setUIMessageStreamOptions({
      messageMetadata: () => ({
        selectedBotId: currentBotId,
        botName: name,
        botAvatar: memberBots.find((b) => b.id === currentBotId)?.avatar,
      }),
    })

    return streamText({
      model: google("gemini-3.5-flash-lite"),
      instructions,
      messages,
      tools,
      stopWhen: isStepCount(60),
      maxRetries: 5,
      abortSignal: signal,
    })
  },
})
