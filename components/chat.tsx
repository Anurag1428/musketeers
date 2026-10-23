"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { UIMessage, ToolUIPart, DynamicToolUIPart } from "ai"
import { ArrowRightLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "cn"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSelectContent,
  PromptInputSelectItem,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  getStatusBadge,
} from "@/components/ai-elements/tool"
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalActions,
  TerminalCopyButton,
  TerminalContent,
} from "@/components/ai-elements/terminal"
import { Spinner } from "@/components/ui/spinner"
import {
  mintChatAccessToken,
  startChatSession,
  loadTranscript,
} from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatBotOption {
  id: string
  name: string
  avatar?: string | null
  job?: string | null
  instructions?: string | null
  sandboxId?: string | null
}

interface ChatProps {
  chatId: string
  botName?: string
  botJob?: string
  instructions?: string
  sandboxId?: string | null
  bots?: ChatBotOption[]
  isGroup?: boolean
}

type AnyToolPart = ToolUIPart | DynamicToolUIPart

// ─── Controlled Tool Wrapper ──────────────────────────────────────────────────

/**
 * Base UI warns if `defaultOpen` on an uncontrolled Collapsible changes across renders.
 * ControlledTool keeps `open` controlled with local state, auto-expanding when
 * `isOpenByDefault` becomes true, without violating Base UI's controlled/uncontrolled rule.
 */
function ControlledTool({
  isOpenByDefault = false,
  className,
  children,
  ...props
}: {
  isOpenByDefault?: boolean
  className?: string
  children: React.ReactNode
} & Omit<
  React.ComponentProps<typeof Tool>,
  "open" | "defaultOpen" | "onOpenChange"
>) {
  const [open, setOpen] = React.useState(isOpenByDefault)

  React.useEffect(() => {
    if (isOpenByDefault) {
      setOpen(true)
    }
  }, [isOpenByDefault])

  return (
    <Tool open={open} onOpenChange={setOpen} className={className} {...props}>
      {children}
    </Tool>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the tool output payload contains a screenshot (base64 field). */
function isScreenshotOutput(
  output: unknown
): output is { base64: string; mediaType: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    "base64" in output &&
    typeof (output as Record<string, unknown>).base64 === "string" &&
    (output as Record<string, unknown>).base64 !== ""
  )
}

/** Extracts the bash stdout string from tool output. */
function getBashOutput(
  output: unknown
): { stdout: string; exitCode: number } | null {
  if (
    typeof output === "object" &&
    output !== null &&
    "stdout" in output &&
    "exitCode" in output
  ) {
    return output as { stdout: string; exitCode: number }
  }
  return null
}

/**
 * Get the tool name from a part.
 * AI SDK encodes tool name as `tool-<name>` in `ToolUIPart.type`,
 * or in `DynamicToolUIPart.toolName`.
 */
function getToolName(part: AnyToolPart): string {
  if (part.type === "dynamic-tool") {
    return part.toolName
  }
  return part.type.replace(/^tool-/, "")
}

// ─── Tool Part Renderers ───────────────────────────────────────────────────────

function BashToolPart({ part }: { part: ToolUIPart }) {
  const bashOutput =
    part.state === "output-available" ? getBashOutput(part.output) : null
  const command =
    part.input && typeof part.input === "object" && "command" in part.input
      ? String((part.input as Record<string, unknown>).command)
      : ""

  return (
    <ControlledTool
      isOpenByDefault={
        part.state === "output-available" || part.state === "output-error"
      }
    >
      <ToolHeader type={part.type} state={part.state} title="bash" />
      <ToolContent>
        {command && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Command
            </p>
            <Terminal output={command} className="text-sm">
              <TerminalContent />
            </Terminal>
          </div>
        )}
        {bashOutput && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Output
              </p>
              <span className="text-xs text-muted-foreground">
                exit {bashOutput.exitCode}
              </span>
            </div>
            <Terminal output={bashOutput.stdout}>
              <TerminalHeader>
                <TerminalTitle>Terminal</TerminalTitle>
                <TerminalActions>
                  <TerminalCopyButton />
                </TerminalActions>
              </TerminalHeader>
              <TerminalContent />
            </Terminal>
          </div>
        )}
        {part.errorText && (
          <ToolOutput output={null} errorText={part.errorText} />
        )}
      </ToolContent>
    </ControlledTool>
  )
}

function GenericToolPart({
  part,
  title,
  showOutput = true,
}: {
  part: ToolUIPart
  title?: string
  showOutput?: boolean
}) {
  return (
    <ControlledTool isOpenByDefault={part.state === "output-error"}>
      <ToolHeader type={part.type} state={part.state} title={title} />
      <ToolContent>
        <ToolInput input={part.input} />
        {showOutput && part.state === "output-available" && (
          <ToolOutput output={part.output} errorText={part.errorText} />
        )}
        {part.errorText && (
          <ToolOutput output={null} errorText={part.errorText} />
        )}
      </ToolContent>
    </ControlledTool>
  )
}

/**
 * show_screen — renders the screenshot as an inline image.
 * The agent invokes this when the user asks to see what's on screen.
 */
function ShowScreenToolPart({ part }: { part: ToolUIPart }) {
  const isReady = part.state === "output-available"
  const screenshot = isReady ? part.output : null
  const hasImage = isScreenshotOutput(screenshot)

  return (
    <ControlledTool isOpenByDefault={isReady && hasImage}>
      <ToolHeader type={part.type} state={part.state} title="show_screen" />
      <ToolContent>
        {hasImage ? (
          <div className="overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${screenshot.mediaType};base64,${screenshot.base64}`}
              alt="Sandbox screen"
              className="w-full object-contain"
              style={{ maxHeight: "480px" }}
            />
          </div>
        ) : (
          getStatusBadge(part.state)
        )}
        {part.errorText && (
          <ToolOutput output={null} errorText={part.errorText} />
        )}
      </ToolContent>
    </ControlledTool>
  )
}

function HandoffToolPart({
  part,
  bots,
  selectedBotId,
  onSelectBotId,
}: {
  part: ToolUIPart
  bots?: ChatBotOption[]
  selectedBotId?: string
  onSelectBotId?: (id: string) => void
}) {
  const isReady = part.state === "output-available"
  const isError: boolean =
    part.state === "output-error" ||
    Boolean(
      isReady &&
        part.output &&
        typeof part.output === "object" &&
        !(part.output as { success?: boolean }).success
    )

  const input =
    part.input && typeof part.input === "object"
      ? (part.input as { targetBot?: string; reason?: string })
      : {}

  const output =
    part.output && typeof part.output === "object"
      ? (part.output as {
          success?: boolean
          targetBotId?: string
          targetBotName?: string
          targetBotAvatar?: string
          targetBotJob?: string
          reason?: string
          error?: string
          message?: string
        })
      : {}

  const targetName: string = output.targetBotName || input.targetBot || "Teammate"
  const targetBot = bots?.find(
    (b) =>
      (output.targetBotId && b.id === output.targetBotId) ||
      b.name.toLowerCase() === targetName.toLowerCase()
  )
  const targetBotId = output.targetBotId || targetBot?.id
  const targetAvatar = output.targetBotAvatar || targetBot?.avatar || targetName
  const targetJob = output.targetBotJob || targetBot?.job
  const reason: string | undefined = output.reason || input.reason
  const isCurrent = Boolean(targetBotId && selectedBotId === targetBotId)

  return (
    <div className="my-2 rounded-xl border border-border/80 bg-muted/40 p-3.5 shadow-sm transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ArrowRightLeft className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground">
                Handoff suggested
              </span>
              <span className="text-xs text-muted-foreground">→</span>
              <div className="flex items-center gap-1.5">
                <ChatAvatar
                  seed={targetAvatar}
                  alt={targetName}
                  className="size-4 shrink-0 rounded-full"
                />
                <span className="text-xs font-medium text-foreground">
                  {targetName}
                </span>
                {targetJob && (
                  <span className="text-[0.7rem] text-muted-foreground">
                    ({targetJob})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {targetBotId && onSelectBotId ? (
          <Button
            type="button"
            variant={isCurrent ? "secondary" : "default"}
            size="xs"
            onClick={() => onSelectBotId(targetBotId)}
            className="shrink-0"
          >
            {isCurrent ? (
              <>
                <Check data-icon="inline-start" />
                Speaking
              </>
            ) : (
              `Talk to ${targetName}`
            )}
          </Button>
        ) : null}
      </div>

      {reason ? (
        <p className="mt-2 text-xs text-muted-foreground border-l-2 border-primary/40 pl-2.5 py-0.5 italic">
          &ldquo;{reason}&rdquo;
        </p>
      ) : null}

      {isError ? (
        <p className="mt-2 text-xs text-destructive">
          {output.error || part.errorText || "Handoff failed"}
        </p>
      ) : null}
    </div>
  )
}

// ─── Tool Part Dispatcher ─────────────────────────────────────────────────────

function ToolPartRenderer({
  part,
  messageId,
  index,
  bots,
  selectedBotId,
  onSelectBotId,
}: {
  part: AnyToolPart
  messageId: string
  index: number
  bots?: ChatBotOption[]
  selectedBotId?: string
  onSelectBotId?: (id: string) => void
}) {
  const key = `${messageId}-tool-${index}`
  const toolName = getToolName(part)

  // Dynamic tools use a different ToolHeader signature — render them generically
  if (part.type === "dynamic-tool") {
    return (
      <ControlledTool key={key} isOpenByDefault={part.state === "output-error"}>
        <ToolHeader
          type={part.type}
          state={part.state}
          toolName={part.toolName}
        />
        <ToolContent>
          <ToolInput input={part.input} />
          {part.state === "output-available" && (
            <ToolOutput output={part.output} errorText={part.errorText} />
          )}
          {part.errorText && (
            <ToolOutput output={null} errorText={part.errorText} />
          )}
        </ToolContent>
      </ControlledTool>
    )
  }

  // Static tool parts
  switch (toolName) {
    case "open_browser":
      return (
        <GenericToolPart key={key} part={part} title="open_browser" showOutput />
      )

    case "bash":
      return <BashToolPart key={key} part={part} />

    case "read_file":
      return (
        <GenericToolPart key={key} part={part} title="read_file" showOutput />
      )

    case "write_file":
      return (
        <GenericToolPart key={key} part={part} title="write_file" showOutput />
      )

    case "list_files":
      return (
        <GenericToolPart key={key} part={part} title="list_files" showOutput />
      )

    case "mouse_click":
      return (
        <GenericToolPart
          key={key}
          part={part}
          title="mouse_click"
          showOutput={false}
        />
      )

    case "mouse_move":
      return (
        <GenericToolPart
          key={key}
          part={part}
          title="mouse_move"
          showOutput={false}
        />
      )

    case "mouse_scroll":
      return (
        <GenericToolPart
          key={key}
          part={part}
          title="mouse_scroll"
          showOutput={false}
        />
      )

    case "keyboard_type":
      return (
        <GenericToolPart
          key={key}
          part={part}
          title="keyboard_type"
          showOutput={false}
        />
      )

    case "keyboard_press":
      return (
        <GenericToolPart
          key={key}
          part={part}
          title="keyboard_press"
          showOutput={false}
        />
      )

    case "handoff":
      return (
        <HandoffToolPart
          key={key}
          part={part}
          bots={bots}
          selectedBotId={selectedBotId}
          onSelectBotId={onSelectBotId}
        />
      )

    case "handoff":
      return (
        <HandoffToolPart
          key={key}
          part={part}
          bots={bots}
          selectedBotId={selectedBotId}
          onSelectBotId={onSelectBotId}
        />
      )

    case "view_screen":
      // Silent tool — never render for the user
      return null

    case "show_screen":
      return <ShowScreenToolPart key={key} part={part} />

    default:
      // Fallback: generic collapsible tool display
      return (
        <ControlledTool key={key} isOpenByDefault={part.state === "output-error"}>
          <ToolHeader type={part.type} state={part.state} />
          <ToolContent>
            <ToolInput input={part.input} />
            {part.state === "output-available" && (
              <ToolOutput output={part.output} errorText={part.errorText} />
            )}
            {part.errorText && (
              <ToolOutput output={null} errorText={part.errorText} />
            )}
          </ToolContent>
        </ControlledTool>
      )
  }
}

// ─── Chat Component ───────────────────────────────────────────────────────────

export function Chat({
  chatId,
  botName,
  botJob,
  instructions,
  sandboxId,
  bots,
  isGroup,
}: ChatProps) {
  const [selectedBotId, setSelectedBotId] = React.useState<string>(() => {
    return bots?.[0]?.id ?? ""
  })

  React.useEffect(() => {
    if (bots && bots.length > 0) {
      setSelectedBotId((prev) => {
        if (prev && bots.some((b) => b.id === prev)) {
          return prev
        }
        return bots[0].id
      })
    }
  }, [bots])

  const selectedBot = React.useMemo(() => {
    return bots?.find((b) => b.id === selectedBotId) ?? bots?.[0]
  }, [bots, selectedBotId])

  const clientData = React.useMemo(
    () => ({
      botName: selectedBot?.name ?? botName,
      botJob: selectedBot?.job ?? botJob,
      botInstructions: (selectedBot?.instructions ?? instructions) ?? null,
      sandboxId: (selectedBot?.sandboxId ?? sandboxId) ?? null,
      selectedBotId: selectedBot?.id,
    }),
    [selectedBot, botName, botJob, instructions, sandboxId]
  )

  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    clientData,
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData: sessionClientData }) =>
      startChatSession({
        chatId,
        clientData: sessionClientData ?? clientData,
      }),
  })

  const { messages: initialMessages, isLoading } = useLoadTranscript(
    chatId,
    loadTranscript,
    { transport }
  )

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <ChatContent
      key={chatId}
      chatId={chatId}
      botName={botName}
      bots={bots}
      isGroup={isGroup}
      selectedBotId={selectedBotId}
      onSelectBotId={setSelectedBotId}
      transport={transport}
      initialMessages={initialMessages}
    />
  )
}

function ChatContent({
  chatId,
  botName,
  bots,
  isGroup,
  selectedBotId,
  onSelectBotId,
  transport,
  initialMessages,
}: {
  chatId: string
  botName?: string
  bots?: ChatBotOption[]
  isGroup?: boolean
  selectedBotId: string
  onSelectBotId: (id: string) => void
  transport: ReturnType<typeof useTriggerChatTransport<typeof chatAgent>>
  initialMessages: UIMessage[]
}) {
  const [input, setInput] = React.useState("")
  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    transport,
    messages: initialMessages,
    resume: initialMessages.length > 0,
  })

  const selectedBot = React.useMemo(() => {
    return bots?.find((b) => b.id === selectedBotId) ?? bots?.[0]
  }, [bots, selectedBotId])

    const getMessageBot = React.useCallback(
    (message: UIMessage, index: number) => {
      // 1. Direct metadata on assistant message
      const meta = (message as unknown as { metadata?: Record<string, unknown> }).metadata
      const metaBotId = (meta?.selectedBotId || meta?.botId) as string | undefined
      if (metaBotId && bots) {
        const found = bots.find((b) => b.id === metaBotId)
        if (found) return found
      }
      if (meta?.botName && typeof meta.botName === "string") {
        const found = bots?.find((b) => b.name === meta.botName)
        if (found) return found
        return {
          id: metaBotId || meta.botName,
          name: meta.botName,
          avatar: (meta.botAvatar as string) || meta.botName,
        }
      }

      // 2. Look backwards for the user message that prompted this response
      for (let i = index - 1; i >= 0; i--) {
        const prevMsg = messages[i]
        if (prevMsg && prevMsg.role === "user") {
          const prevMeta = (prevMsg as unknown as { metadata?: Record<string, unknown> }).metadata
          const prevBotId = (prevMeta?.selectedBotId || prevMeta?.botId) as string | undefined
          if (prevBotId && bots) {
            const found = bots.find((b) => b.id === prevBotId)
            if (found) return found
          }
          if (prevMeta?.botName && typeof prevMeta.botName === "string") {
            const found = bots?.find((b) => b.name === prevMeta.botName)
            if (found) return found
          }
          break
        }
      }

      // 3. Fallback to latest in-flight / selected bot
      if (index === messages.length - 1 && selectedBot) {
        return selectedBot
      }

      return selectedBot || bots?.[0] || null
    },
    [bots, messages, selectedBot]
  )

  const getUserTargetBot = React.useCallback(
    (message: UIMessage, index: number) => {
      // 1. Direct metadata on user message
      const meta = (message as unknown as { metadata?: Record<string, unknown> }).metadata
      const metaBotId = (meta?.selectedBotId || meta?.botId) as string | undefined
      if (metaBotId && bots) {
        const found = bots.find((b) => b.id === metaBotId)
        if (found) return found
      }
      if (meta?.botName && typeof meta.botName === "string") {
        const found = bots?.find((b) => b.name === meta.botName)
        if (found) return found
        return {
          id: metaBotId || meta.botName,
          name: meta.botName,
          avatar: (meta.botAvatar as string) || meta.botName,
        }
      }

      // 2. Look forward at the assistant response answering this user message
      for (let i = index + 1; i < messages.length; i++) {
        const nextMsg = messages[i]
        if (nextMsg) {
          if (nextMsg.role === "assistant") {
            const nextMeta = (nextMsg as unknown as { metadata?: Record<string, unknown> }).metadata
            const nextBotId = (nextMeta?.selectedBotId || nextMeta?.botId) as string | undefined
            if (nextBotId && bots) {
              const found = bots.find((b) => b.id === nextBotId)
              if (found) return found
            }
            if (nextMeta?.botName && typeof nextMeta.botName === "string") {
              const found = bots?.find((b) => b.name === nextMeta.botName)
              if (found) return found
            }
          }
          break
        }
      }

      // 3. Fallback to currently selected bot or first bot in group
      return selectedBot || bots?.[0] || null
    },
    [bots, messages, selectedBot]
  )

  const isGenerating = status === "submitted" || status === "streaming"

  const handleStop = React.useCallback(() => {
    stop()
    transport.stopGeneration(chatId)
  }, [stop, transport, chatId])

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim() || input.trim()
    if (!text) return

    sendMessage(
      { text },
      {
        metadata: {
          selectedBotId: selectedBot?.id,
          botName: selectedBot?.name,
          botAvatar: selectedBot?.avatar,
          botJob: selectedBot?.job,
          botInstructions: selectedBot?.instructions ?? null,
          sandboxId: selectedBot?.sandboxId ?? null,
        },
      }
    )
    setInput("")
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title={
                isGroup
                  ? "Group Chat"
                  : botName
                  ? `Chat with ${botName}`
                  : "Start a conversation"
              }
              description={
                isGroup && selectedBot
                  ? `Pick a bot and type a message below. Currently talking to ${selectedBot.name}.`
                  : "Type a message below to begin chatting."
              }
            />
          ) : (
            messages.map((message, messageIndex) => {
              const isAssistant = message.role === "assistant"
              const messageBot =
                isGroup && isAssistant
                  ? getMessageBot(message, messageIndex)
                  : null
              const userTargetBot =
                isGroup && !isAssistant
                  ? getUserTargetBot(message, messageIndex)
                  : null
              const hasNewlines =
                !isAssistant &&
                Boolean(
                  message.parts?.some(
                    (p) => p.type === "text" && p.text?.includes("\n")
                  )
                )

              return (
                <Message from={message.role} key={message.id}>
                  {isGroup && isAssistant ? (
                    <div className="flex items-start gap-3 w-full">
                      <ChatAvatar
                        seed={messageBot?.avatar || messageBot?.name || "bot"}
                        alt={messageBot?.name || "Bot"}
                        className="size-8 shrink-0 rounded-full mt-0.5"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        {messageBot?.name && (
                          <span className="text-xs font-semibold text-muted-foreground mb-1 select-none">
                            {messageBot.name}
                          </span>
                        )}
                        <MessageContent>
                          {message.parts?.map((part, i) => {
                            if (part.type === "text") {
                              return (
                                <MessageResponse key={`${message.id}-${i}`}>
                                  {part.text}
                                </MessageResponse>
                              )
                            }

                            // Render tool call parts (type starts with "tool-" or is "dynamic-tool")
                            if (
                              part.type.startsWith("tool-") ||
                              part.type === "dynamic-tool"
                            ) {
                              return (
                                <ToolPartRenderer
                                  key={`${message.id}-${i}`}
                                  part={part as AnyToolPart}
                                  messageId={message.id}
                                  index={i}
                                  bots={bots}
                                  selectedBotId={selectedBotId}
                                  onSelectBotId={onSelectBotId}
                                />
                              )
                            }

                            return null
                          })}
                        </MessageContent>
                      </div>
                    </div>
                  ) : (
                    <MessageContent
                      className={
                        isGroup && userTargetBot
                          ? hasNewlines
                            ? "group-[.is-user]:flex-row group-[.is-user]:items-start group-[.is-user]:gap-2.5 group-[.is-user]:py-2.5 group-[.is-user]:px-3.5"
                            : "group-[.is-user]:flex-row group-[.is-user]:items-center group-[.is-user]:gap-2.5 group-[.is-user]:py-2 group-[.is-user]:px-3.5"
                          : undefined
                      }
                    >
                      {isGroup && userTargetBot && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-6.5 shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/25 dark:bg-black/40 border border-border/70 text-foreground text-xs font-semibold shadow-2xs select-none",
                            hasNewlines && "mt-0.5"
                          )}
                        >
                          <ChatAvatar
                            seed={userTargetBot.avatar || userTargetBot.name}
                            alt={userTargetBot.name}
                            className="size-3.5 shrink-0 rounded-full"
                          />
                          <span className="truncate max-w-[160px] font-medium leading-none">
                            {userTargetBot.name}
                          </span>
                        </Badge>
                      )}
                      {message.parts?.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <span
                              key={`${message.id}-${i}`}
                              className="text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0"
                            >
                              {part.text.replace(/^\n+/, "")}
                            </span>
                          )
                        }

                        // Render tool call parts (type starts with "tool-" or is "dynamic-tool")
                        if (
                          part.type.startsWith("tool-") ||
                          part.type === "dynamic-tool"
                        ) {
                          return (
                            <ToolPartRenderer
                              key={`${message.id}-${i}`}
                              part={part as AnyToolPart}
                              messageId={message.id}
                              index={i}
                              bots={bots}
                              selectedBotId={selectedBotId}
                              onSelectBotId={onSelectBotId}
                            />
                          )
                        }

                        return null
                      })}
                    </MessageContent>
                  )}
                </Message>
              )
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4 shrink-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              placeholder={
                isGroup && selectedBot
                  ? `Message ${selectedBot.name}...`
                  : botName
                  ? `Message ${botName}...`
                  : "Ask anything..."
              }
              onChange={(e) => setInput(e.target.value)}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-between items-center">
            {isGroup && bots && bots.length > 0 ? (
              <PromptInputTools>
                <PromptInputSelect
                  value={selectedBotId}
                  onValueChange={(val) => {
                    if (val) onSelectBotId(String(val))
                  }}
                >
                  <PromptInputSelectTrigger className="h-8 gap-2 px-2.5 rounded-lg border border-input bg-transparent text-xs hover:bg-muted font-normal text-foreground">
                    {selectedBot && (
                      <ChatAvatar
                        seed={selectedBot.avatar || selectedBot.name}
                        alt={selectedBot.name}
                        className="size-4 shrink-0 rounded-full"
                      />
                    )}
                    <PromptInputSelectValue placeholder="Pick a bot">
                      {selectedBot?.name ?? "Pick a bot"}
                    </PromptInputSelectValue>
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent align="start">
                    {bots.map((b) => (
                      <PromptInputSelectItem key={b.id} value={b.id}>
                        <div className="flex items-center gap-2">
                          <ChatAvatar
                            seed={b.avatar || b.name}
                            alt={b.name}
                            className="size-4 shrink-0 rounded-full"
                          />
                          <span className="font-medium text-xs">{b.name}</span>
                        </div>
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              </PromptInputTools>
            ) : (
              <div />
            )}
            <PromptInputSubmit
              disabled={!input.trim() && !isGenerating}
              status={status}
              onStop={handleStop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export const ChatView = Chat
