"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { UIMessage, ToolUIPart, DynamicToolUIPart } from "ai"
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
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
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

interface ChatProps {
  chatId: string
  botName?: string
  botJob?: string
  instructions?: string
  sandboxId?: string | null
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

// ─── Tool Part Dispatcher ─────────────────────────────────────────────────────

function ToolPartRenderer({
  part,
  messageId,
  index,
}: {
  part: AnyToolPart
  messageId: string
  index: number
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
}: ChatProps) {
  const clientData = React.useMemo(
    () => ({
      botName,
      botJob,
      botInstructions: instructions ?? null,
      sandboxId: sandboxId ?? null,
    }),
    [botName, botJob, instructions, sandboxId]
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
      transport={transport}
      initialMessages={initialMessages}
    />
  )
}

function ChatContent({
  chatId,
  botName,
  transport,
  initialMessages,
}: {
  chatId: string
  botName?: string
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

  const isGenerating = status === "submitted" || status === "streaming"

  const handleStop = React.useCallback(() => {
    stop()
    transport.stopGeneration(chatId)
  }, [stop, transport, chatId])

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim() || input.trim()
    if (!text) return

    sendMessage({ text })
    setInput("")
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title={botName ? `Chat with ${botName}` : "Start a conversation"}
              description="Type a message below to begin chatting."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
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
                        />
                      )
                    }

                    return null
                  })}
                </MessageContent>
              </Message>
            ))
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
                botName ? `Message ${botName}...` : "Ask anything..."
              }
              onChange={(e) => setInput(e.target.value)}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
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
