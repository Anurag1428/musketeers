import { chat } from "@trigger.dev/sdk/ai"
import { google } from "@ai-sdk/google"
import { tool, isStepCount } from "ai"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { bots, chatMembers, chats } from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"
import { getDaytonaClient } from "@/lib/daytona"

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

  const sandboxInfo = params.sandboxId?.trim()
    ? `You are connected to an isolated Daytona cloud sandbox environment (Sandbox ID: ${params.sandboxId.trim()}).`
    : `You are running in a cloud environment without a provisioned sandbox.`

  const computerUseGuidance = params.sandboxId?.trim()
    ? [
        `# Computer Use & Desktop Environment`,
        `- The sandbox runs an XFCE4 desktop GUI on Linux (DISPLAY=:0).`,
        `- To browse the web or visit any site, ALWAYS use the \`open_browser\` tool.`,
        `- When asked to search for something on the web, directly pass the search results URL to \`open_browser\` (e.g. \`https://duckduckgo.com/?q=...\` or \`https://www.google.com/search?q=...\`) to immediately reach the results without wasting turns typing into a blank homepage.`,
        `- NEVER run Python scripts (urllib, requests, beautifulsoup, bs4) or curl in bash to scrape or parse web pages when asked to browse or view a website. ALWAYS use \`open_browser\` and desktop interaction tools.`,
        `- Follow this execution loop when asked to perform a browser or desktop task:`,
        `  1. Call \`open_browser\` with the target or search URL.`,
        `  2. Call \`view_screen\` to inspect the desktop visually if further clicks or interactions are required.`,
        `  3. Use \`mouse_click(x, y)\`, \`keyboard_type(text)\`, and \`keyboard_press(key)\` to interact with buttons or dismiss popups based on coordinates in the screenshot.`,
        `  4. When the page is ready or whenever the user asks for a screenshot, ALWAYS call \`show_screen\` so the image is rendered to the user in the chat, then provide a helpful summary of what you found.`,
      ].join("\n")
    : ""

  let groupChatGuidance = ""
  if (params.isGroup) {
    const chatTitle = params.chatName?.trim() || "Group Chat"
    const teammates = (params.otherBots || [])
      .map(
        (b) =>
          `- **${b.name}** — Role: ${b.job}${
            b.instructions ? ` | Specialty: ${b.instructions.slice(0, 200)}` : ""
          }`
      )
      .join("\n")

    groupChatGuidance = [
      `# Group Chat Context`,
      `You are a member of the group chat "${chatTitle}".`,
      `You are currently responding as **${name}** (Role: ${job}). Always stay in your own persona.`,
      teammates
        ? `\nOther participating bots in this group chat:\n${teammates}`
        : "",
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
    `# Purpose`,
    purpose,
    ``,
    `# Environment`,
    sandboxInfo,
    computerUseGuidance ? `\n${computerUseGuidance}` : "",
    groupChatGuidance ? `\n${groupChatGuidance}` : "",
    ``,
    `Always respond in character according to your role and purpose. Maintain a helpful and professional demeanor.`,
  ].join("\n")
}

async function getBotById(botId: string) {
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1)

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

  return sandbox
}

/**
 * Creates all computer-use tools bound to a specific Daytona sandbox.
 * All tools are server-side only — they run in Trigger.dev, never in the browser.
 */
function makeSandboxTools(sandboxId: string) {
  return {
    open_browser: tool({
      description:
        "Open the Chromium web browser on the desktop to a specific URL. If the user asks to search for something (e.g. 'search code with antonio'), directly navigate to the search URL (e.g. 'https://duckduckgo.com/?q=code+with+antonio') to immediately load the results without needing manual typing.",
      inputSchema: z.object({
        url: z
          .string()
          .default("https://duckduckgo.com")
          .describe("URL to navigate to"),
      }),
      execute: async ({ url }: { url: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const targetUrl = url.startsWith("http") ? url : `https://${url}`
        await sandbox.process.executeCommand(
          `export DISPLAY=:0; nohup chromium --no-sandbox --start-maximized --no-first-run --no-default-browser-check --disable-fre --disable-search-engine-choice-screen "${targetUrl}" </dev/null >/dev/null 2>&1 &`
        )
        // Give the window 2.5 seconds to render on screen
        await new Promise((res) => setTimeout(res, 2500))
        return {
          success: true,
          url: targetUrl,
          instruction:
            "Chromium has opened. Now call view_screen to inspect the page layout, find buttons or inputs to interact with, and call show_screen when ready to display the result to the user.",
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
        "Read the contents of a file from the sandbox filesystem and return them as a string.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
      }),
      execute: async ({ path }: { path: string }) => {
        const sandbox = await getActiveSandbox(sandboxId)
        const buffer = await sandbox.fs.downloadFile(path)
        return { content: buffer.toString("utf-8"), path }
      },
    }),

    write_file: tool({
      description:
        "Write text content to a file in the sandbox filesystem. Creates or overwrites the file.",
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
        "Click the mouse at the given screen coordinates in the sandbox desktop.",
      inputSchema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        button: z
          .enum(["left", "right", "middle"])
          .default("left")
          .describe("Mouse button"),
        double: z
          .boolean()
          .default(false)
          .describe("Whether to double-click"),
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
      description: "Move the mouse cursor to the given coordinates.",
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
      description: "Scroll the mouse wheel at the given coordinates.",
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
        "Type text into the currently focused element in the sandbox desktop.",
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
        const screenshot =
          await sandbox.computerUse.screenshot.takeFullScreen()
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
        const screenshot =
          await sandbox.computerUse.screenshot.takeFullScreen()
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

    const sandboxTools = sandboxId ? makeSandboxTools(sandboxId) : {}
    const isGroup = currentChat?.kind === "group" || memberBots.length > 1

    if (isGroup && memberBots.length > 1) {
      return {
        ...sandboxTools,
        handoff: makeHandoffTool(memberBots, currentBotId),
      }
    }

    return sandboxTools
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
      stopWhen: isStepCount(25),
      maxRetries: 5,
      abortSignal: signal,
    })
  },
})
