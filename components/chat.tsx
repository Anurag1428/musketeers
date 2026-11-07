"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { UIMessage, ToolUIPart, DynamicToolUIPart } from "ai"
import {
  ArrowRightLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  MessageSquare,
  Rocket,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SpeechInput } from "@/components/ai-elements/speech-input"
import { useJarvisVoice } from "@/hooks/use-jarvis-voice"
import { toast } from "@/components/ui/toast"
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
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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

  const targetName: string =
    output.targetBotName || input.targetBot || "Teammate"
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
    <div className="my-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-sm transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ArrowRightLeft className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">
                Active Bot Changed
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
                Active
              </>
            ) : (
              `Switch to ${targetName}`
            )}
          </Button>
        ) : null}
      </div>

      {isCurrent ? (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/40 pt-2 text-[0.75rem] text-muted-foreground">
          <Check className="size-3 text-primary" />
          <span>
            Bot automatically changed to <strong>{targetName}</strong>
          </span>
        </div>
      ) : null}

      {reason ? (
        <p className="mt-2 border-l-2 border-primary/40 py-0.5 pl-2.5 text-xs text-muted-foreground italic">
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

function StartupLeadsToolPart({
  part,
  onSendPrompt,
}: {
  part: ToolUIPart
  onSendPrompt?: (text: string) => void
}) {
  const isReady = part.state === "output-available"
  const isError = part.state === "output-error"
  const isLoading = part.state === "input-available"

  const output = isReady && typeof part.output === "object" ? (part.output as any) : null
  const startups = output?.startups || []
  const count = output?.count || startups.length
  const timeframe = output?.timeframe || "past week"

  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    toast.add({
      title: "Copied to clipboard",
      description: `${label} copied.`,
      type: "success",
    })
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 2000)
  }

  if (isLoading) {
    return (
      <div className="my-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-center gap-3">
        <Spinner className="size-4 text-primary shrink-0" />
        <div className="text-xs">
          <p className="font-medium text-foreground">Scouting live startup funding...</p>
          <p className="text-muted-foreground text-[11px]">
            Searching TechCrunch, PRNewswire, and venture rounds with Firecrawl.
          </p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="my-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
        Failed to scout startups: {part.errorText || "Unknown error"}
      </div>
    )
  }

  if (!isReady || startups.length === 0) {
    return null
  }

  return (
    <div className="my-3 space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Rocket className="size-3.5" />
          </div>
          <h4 className="text-xs font-semibold text-foreground">
            Scouted {count} Startups ({timeframe === "48h" ? "Past 48 Hours" : "Past Week"})
          </h4>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        >
          ✓ Firecrawl Verified
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {startups.map((s: any, idx: number) => {
          const startupName = s.startupName || s.headline || "Startup"
          const cleanDomain =
            s.domain ||
            (s.articleUrl ? s.articleUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : "")
          const fundingRound = s.fundingRound || "Seed"
          const fundingAmount = s.fundingAmount || "Undisclosed"
          const founderName = s.founderName || "Founder"
          const founderRole = s.founderRole || "Leadership"
          const linkedinUrl =
            s.linkedinXrayUrl || (s.verifiedProfiles?.[0]?.linkedinUrl)
          const verifiedEmail = s.verifiedEmail
          const summary = s.productSummary || s.summary || s.description || ""
          const isRumoured = Boolean(s.isRumoured)
          const announcedDate = s.announcedDate || "This week"
          const linkedinNote = s.linkedinNote || ""
          const emailSubject = s.emailSubject || ""
          const emailBody = s.emailBody || ""

          return (
            <div
              key={idx}
              className="rounded-xl border bg-card/70 p-3.5 space-y-2.5 shadow-xs transition-all hover:border-border"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">
                      {startupName}
                    </span>
                    {cleanDomain && (
                      <a
                        href={`https://${cleanDomain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        {cleanDomain}
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {fundingRound} ({fundingAmount})
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground gap-0.5"
                    >
                      <Calendar className="size-2.5" />
                      {announcedDate}
                    </Badge>
                    {isRumoured ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                      >
                        ⚡ Rumour
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      >
                        ✓ Confirmed
                      </Badge>
                    )}
                    {s.mxVerified && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      >
                        <CheckCircle2 className="size-2.5" />
                        MX Verified
                      </Badge>
                    )}
                  </div>
                </div>

                {onSendPrompt && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      onSendPrompt(
                        `Tell me more about ${startupName} and draft a custom technical pitch for ${founderName}`
                      )
                    }
                    className="text-[11px] gap-1 shrink-0 text-muted-foreground hover:text-primary cursor-pointer"
                    title="Ask agent to deep-dive or write custom pitch"
                  >
                    <MessageSquare className="size-3" />
                    Ask Agent
                  </Button>
                )}
              </div>

              {/* Product Description */}
              {summary && (
                <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">
                  {summary}
                </p>
              )}

              {/* Founder & Contact Block */}
              <div className="bg-muted/40 p-2.5 rounded-lg border text-xs flex flex-col gap-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Decision Maker:</span>
                    <span className="font-medium text-foreground">{founderName}</span>
                    <span className="text-muted-foreground text-[11px]">
                      ({founderRole})
                    </span>
                  </div>
                  {linkedinUrl && (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 font-medium text-[11px] shrink-0"
                    >
                      Open LinkedIn Profile
                      <ExternalLink className="size-2.5" />
                    </a>
                  )}
                </div>

                {verifiedEmail && (
                  <div className="flex items-center justify-between border-t border-border/40 pt-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Email:</span>
                      <code className="font-mono text-primary bg-primary/5 px-1 py-0.5 rounded text-[11px]">
                        {verifiedEmail}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(verifiedEmail, `em-${idx}`, "Email")
                        }
                        className="text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 text-[11px]"
                      >
                        {copiedKey === `em-${idx}` ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Pitch Tabs */}
              {(linkedinNote || emailBody) && (
                <Tabs defaultValue="note" className="w-full">
                  <TabsList className="h-6.5 w-full justify-start rounded-md bg-muted/60 p-0.5">
                    {linkedinNote && (
                      <TabsTrigger
                        value="note"
                        className="h-5.5 text-[11px] px-2"
                      >
                        LinkedIn Note
                      </TabsTrigger>
                    )}
                    {emailBody && (
                      <TabsTrigger
                        value="email"
                        className="h-5.5 text-[11px] px-2"
                      >
                        Cold Email Pitch
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {linkedinNote && (
                    <TabsContent value="note" className="mt-1.5 space-y-1">
                      <div className="rounded-lg border bg-background p-2.5 text-xs text-foreground leading-relaxed flex flex-col justify-between">
                        <span>{linkedinNote}</span>
                        <div className="mt-2 flex items-center justify-between text-muted-foreground border-t pt-1.5 text-[10px]">
                          <span>{linkedinNote.length}/280 chars</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                linkedinNote,
                                `note-${idx}`,
                                "LinkedIn Note"
                              )
                            }
                            className="text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            {copiedKey === `note-${idx}` ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            Copy Note
                          </button>
                        </div>
                      </div>
                    </TabsContent>
                  )}

                  {emailBody && (
                    <TabsContent value="email" className="mt-1.5 space-y-1">
                      <div className="rounded-lg border bg-background p-2.5 text-xs text-foreground space-y-1.5">
                        <div className="flex items-center justify-between border-b pb-1">
                          <span className="font-medium text-foreground">
                            Subject: {emailSubject}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                `${emailSubject}\n\n${emailBody}`,
                                `full-${idx}`,
                                "Email Pitch"
                              )
                            }
                            className="text-primary hover:underline flex items-center gap-1 font-medium text-[10px] cursor-pointer"
                          >
                            {copiedKey === `full-${idx}` ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            Copy Full Email
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground text-[11px] leading-relaxed">
                          {emailBody}
                        </p>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StartupIntelToolPart({
  part,
  onSendPrompt,
}: {
  part: ToolUIPart
  onSendPrompt?: (text: string) => void
}) {
  const isReady = part.state === "output-available"
  const isError = part.state === "output-error"
  const output = isReady && typeof part.output === "object" ? (part.output as any) : null

  if (part.state === "input-available") {
    return (
      <div className="my-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-center gap-3">
        <Spinner className="size-4 text-primary shrink-0" />
        <div className="text-xs">
          <p className="font-medium text-foreground">
            Scraping 360° company intelligence...
          </p>
          <p className="text-muted-foreground text-[11px]">
            Reading live website, checking founder LinkedIn profiles, and testing email MX.
          </p>
        </div>
      </div>
    )
  }

  if (isError || !output) return null

  const founders = output.founders || []

  return (
    <div className="my-3 rounded-xl border bg-card/70 p-4 space-y-3 text-xs shadow-xs">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Search className="size-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-foreground">
              {output.companyName}
            </h4>
            {output.domain && (
              <a
                href={`https://${output.domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:underline flex items-center gap-1 text-[11px]"
              >
                {output.domain} <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] text-primary bg-primary/10">
          360° Intel Dossier
        </Badge>
      </div>

      <div>
        <span className="text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
          Product & Mission
        </span>
        <p className="text-foreground/90 mt-1 leading-relaxed text-xs">
          {output.productSummary}
        </p>
      </div>

      {founders.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <span className="text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
            Key Founders & Leadership
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {founders.map((f: any, idx: number) => (
              <div
                key={idx}
                className="bg-muted/40 p-2 rounded-lg border flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                    {f.role}
                  </p>
                </div>
                {f.linkedinUrl && (
                  <a
                    href={f.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-[11px] font-medium flex items-center gap-0.5 shrink-0"
                  >
                    LinkedIn <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {onSendPrompt && (
        <div className="flex justify-end pt-1 border-t">
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              onSendPrompt(
                `Draft a high-converting cold email and LinkedIn note for ${output.companyName}`
              )
            }
            className="cursor-pointer gap-1.5"
          >
            <Sparkles className="size-3 text-primary" />
            Ask Agent to Draft Outreach
          </Button>
        </div>
      )}
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
  onSendPrompt,
}: {
  part: AnyToolPart
  messageId: string
  index: number
  bots?: ChatBotOption[]
  selectedBotId?: string
  onSelectBotId?: (id: string) => void
  onSendPrompt?: (text: string) => void
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
        <GenericToolPart
          key={key}
          part={part}
          title="open_browser"
          showOutput
        />
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

    case "sweep_funded_startups":
      return (
        <StartupLeadsToolPart
          key={key}
          part={part}
          onSendPrompt={onSendPrompt}
        />
      )

    case "get_startup_full_intel":
      return (
        <StartupIntelToolPart
          key={key}
          part={part}
          onSendPrompt={onSendPrompt}
        />
      )

    default:
      // Fallback: generic collapsible tool display
      return (
        <ControlledTool
          key={key}
          isOpenByDefault={part.state === "output-error"}
        >
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
      botInstructions: selectedBot?.instructions ?? instructions ?? null,
      sandboxId: selectedBot?.sandboxId ?? sandboxId ?? null,
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

  const sanitizedInitialMessages = React.useMemo(() => {
    if (!initialMessages || initialMessages.length === 0) return []
    const seen = new Set<string>()
    const result: UIMessage[] = []
    for (let i = initialMessages.length - 1; i >= 0; i--) {
      const msg = initialMessages[i]
      if (msg && msg.id && !seen.has(msg.id)) {
        seen.add(msg.id)
        result.unshift(msg)
      }
    }
    return result
  }, [initialMessages])

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
      initialMessages={sanitizedInitialMessages}
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

  const uniqueMessages = React.useMemo(() => {
    if (!messages || messages.length === 0) return []
    const seen = new Set<string>()
    const result: UIMessage[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg && msg.id && !seen.has(msg.id)) {
        seen.add(msg.id)
        result.unshift(msg)
      }
    }
    return result
  }, [messages])

  const {
    isSpeaking,
    autoSpeak,
    speakingMessageId,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
  } = useJarvisVoice()

  const isGenerating = status === "submitted" || status === "streaming"
  const wasGeneratingRef = React.useRef(false)
  const lastHandledMsgIdRef = React.useRef<string | null>(
    initialMessages[initialMessages.length - 1]?.id ?? null
  )

  // Auto-speak new assistant responses when generation completes
  React.useEffect(() => {
    if (isGenerating) {
      wasGeneratingRef.current = true
      stopSpeaking()
    } else if (wasGeneratingRef.current && status === "ready") {
      wasGeneratingRef.current = false

      if (messages.length === 0) return

      const lastMsg = messages[messages.length - 1]
      if (
        lastMsg &&
        lastMsg.role === "assistant" &&
        lastHandledMsgIdRef.current !== lastMsg.id
      ) {
        lastHandledMsgIdRef.current = lastMsg.id

        if (autoSpeak) {
          const textParts = lastMsg.parts
            ?.filter((p) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ")
          if (textParts) {
            speak(textParts, { messageId: lastMsg.id, isAuto: true })
          }
        }
      }
    } else if (!isGenerating && status === "ready" && messages.length > 0) {
      // Keep tracking latest assistant message even if autoSpeak is off,
      // so toggling autoSpeak later NEVER re-plays old messages!
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === "assistant") {
        lastHandledMsgIdRef.current = lastMsg.id
      }
    }
  }, [isGenerating, status, autoSpeak, messages, speak, stopSpeaking])

  const selectedBot = React.useMemo(() => {
    return bots?.find((b) => b.id === selectedBotId) ?? bots?.[0]
  }, [bots, selectedBotId])

  const getMessageBot = React.useCallback(
    (message: UIMessage, index: number) => {
      // 1. Direct metadata on assistant message
      const meta = (
        message as unknown as { metadata?: Record<string, unknown> }
      ).metadata
      const metaBotId = (meta?.selectedBotId || meta?.botId) as
        string | undefined
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
          const prevMeta = (
            prevMsg as unknown as { metadata?: Record<string, unknown> }
          ).metadata
          const prevBotId = (prevMeta?.selectedBotId || prevMeta?.botId) as
            string | undefined
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
      const meta = (
        message as unknown as { metadata?: Record<string, unknown> }
      ).metadata
      const metaBotId = (meta?.selectedBotId || meta?.botId) as
        string | undefined
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
            const nextMeta = (
              nextMsg as unknown as { metadata?: Record<string, unknown> }
            ).metadata
            const nextBotId = (nextMeta?.selectedBotId || nextMeta?.botId) as
              string | undefined
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

  // Track handled handoff event IDs so each handoff triggers at most once
  const handledHandoffsRef = React.useRef<Set<string>>(new Set())
  const lastPendingHandoffRef = React.useRef<{
    targetBotId: string
    targetBotName: string
    originalQuery: string
  } | null>(null)

  // Seed handled handoffs from initialMessages on mount so historical handoffs don't fire toasts
  React.useEffect(() => {
    for (const msg of initialMessages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts || []) {
        const output = (part as any).output
        if (output?.targetBotId) {
          handledHandoffsRef.current.add(`${msg.id}-${output.targetBotId}`)
        }
      }
    }
  }, [initialMessages])

  // Watch for new handoff tool calls to auto-switch the active bot and show confirmation on screen
  React.useEffect(() => {
    if (!isGroup || !bots || bots.length === 0) return

    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts || []) {
        const isHandoff =
          part.type === "tool-handoff" ||
          ((part.type.startsWith("tool-") || part.type === "dynamic-tool") &&
            (part as any).toolName === "handoff")

        if (!isHandoff) continue

        const output = (part as any).output
        if (output && output.success && output.targetBotId) {
          const handoffKey = `${msg.id}-${output.targetBotId}`
          if (!handledHandoffsRef.current.has(handoffKey)) {
            handledHandoffsRef.current.add(handoffKey)

            const targetBot = bots.find(
              (b) =>
                b.id === output.targetBotId ||
                b.name.toLowerCase() ===
                  (output.targetBotName || "").toLowerCase()
            )
            const targetId = targetBot?.id || output.targetBotId
            const targetName =
              targetBot?.name || output.targetBotName || "Teammate"

            // 1. Automatically switch the active bot
            if (targetId) {
              onSelectBotId(targetId)
            }

            // 2. Show on screen that the active bot changed
            toast.add({
              title: "Active Bot Changed",
              description: `Switched speaking bot to ${targetName}.`,
              type: "info",
            })

            // 3. Find user query to auto-continue with the new bot
            const userMsgs = messages.filter((m) => m.role === "user")
            const lastUser = userMsgs[userMsgs.length - 1]
            let originalQuery = ""
            if (lastUser) {
              const textPart = lastUser.parts?.find((p) => p.type === "text")
              originalQuery = textPart?.text || ""
            }

            lastPendingHandoffRef.current = {
              targetBotId: targetId,
              targetBotName: targetName,
              originalQuery,
            }
          }
        }
      }
    }
  }, [isGroup, bots, messages, onSelectBotId])

  // When generation finishes and there is a pending auto-handoff, auto-trigger the new bot
  React.useEffect(() => {
    if (status !== "ready") return
    if (!lastPendingHandoffRef.current) return

    const pending = lastPendingHandoffRef.current
    lastPendingHandoffRef.current = null

    const targetBot = bots?.find((b) => b.id === pending.targetBotId)
    if (!targetBot) return

    // Prevent loop: check if recent message was already an auto-handoff
    const recentMessages = messages.slice(-3)
    const wasAlreadyAutoHandoff = recentMessages.some(
      (m) =>
        (m as unknown as { metadata?: Record<string, unknown> }).metadata
          ?.isAutoHandoff
    )
    if (wasAlreadyAutoHandoff) return

    if (pending.originalQuery) {
      sendMessage(
        {
          text: `[Handoff to ${pending.targetBotName}]: Please check your Memory.md and answer: "${pending.originalQuery}"`,
        },
        {
          metadata: {
            selectedBotId: targetBot.id,
            botName: targetBot.name,
            botJob: targetBot.job,
            botInstructions: targetBot.instructions ?? null,
            sandboxId: targetBot.sandboxId ?? null,
            isAutoHandoff: true,
          },
        }
      )
    }
  }, [status, bots, messages, sendMessage])

  const handleStop = React.useCallback(() => {
    stopSpeaking()
    stop()
    transport.stopGeneration(chatId)
  }, [stopSpeaking, stop, transport, chatId])

  const handleSubmitText = React.useCallback(
    (text: string) => {
      stopSpeaking()
      if (!text.trim()) return

      sendMessage(
        { text: text.trim() },
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
    },
    [stopSpeaking, sendMessage, selectedBot]
  )

  const handleSubmit = (message: PromptInputMessage) => {
    stopSpeaking()
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {uniqueMessages.length === 0 ? (
            <div className="flex flex-col items-center">
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
                    : "Your personal autonomous agent is ready. Ask anything or pick a quick radar action below."
                }
              />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-w-lg px-4">
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() =>
                    handleSubmitText(
                      "Find 5 AI startups funded in the past week with verified founder LinkedIn profiles."
                    )
                  }
                  className="rounded-full text-xs gap-1.5 cursor-pointer bg-card/60 hover:bg-primary/10 hover:border-primary/40 shadow-2xs"
                >
                  <Rocket className="size-3 text-primary" />
                  Scout AI Seed rounds this week
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() =>
                    handleSubmitText(
                      "Find 4 tech startups rumoured or in talks to raise funding in the past week."
                    )
                  }
                  className="rounded-full text-xs gap-1.5 cursor-pointer bg-card/60 hover:bg-primary/10 hover:border-primary/40 shadow-2xs"
                >
                  <Sparkles className="size-3 text-amber-500" />
                  Find in-talks / rumoured raises
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() =>
                    handleSubmitText(
                      "Give me full 360-degree intel, founders, and email deliverability for OpenRouter."
                    )
                  }
                  className="rounded-full text-xs gap-1.5 cursor-pointer bg-card/60 hover:bg-primary/10 hover:border-primary/40 shadow-2xs"
                >
                  <Search className="size-3 text-blue-500" />
                  Deep-dive company intel
                </Button>
              </div>
            </div>
          ) : (
            uniqueMessages.map((message, messageIndex) => {
              const meta = (
                message as unknown as { metadata?: Record<string, unknown> }
              ).metadata
              if (meta?.isAutoHandoff) {
                const targetBotName = (meta.botName as string) || "Teammate"
                return (
                  <div
                    key={`handoff-${message.id}-${messageIndex}`}
                    className="my-3 flex items-center justify-center"
                  >
                    <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-medium text-foreground shadow-xs">
                      <ArrowRightLeft className="size-3 animate-pulse text-primary" />
                      {targetBotName} taking over to answer...
                    </span>
                  </div>
                )
              }

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
                <Message
                  from={message.role}
                  key={`msg-${message.id}-${messageIndex}`}
                >
                  {isGroup && isAssistant ? (
                    <div className="flex w-full items-start gap-3">
                      <ChatAvatar
                        seed={messageBot?.avatar || messageBot?.name || "bot"}
                        alt={messageBot?.name || "Bot"}
                        className="mt-0.5 size-8 shrink-0 rounded-full"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        {messageBot?.name && (
                          <span className="mb-1 text-xs font-semibold text-muted-foreground select-none">
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
                                  onSendPrompt={handleSubmitText}
                                />
                              )
                            }

                            return null
                          })}
                        </MessageContent>
                        {message.parts?.some((p) => p.type === "text") && (
                          <div className="mt-1 flex items-center gap-1.5 opacity-60 transition-opacity hover:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="size-6 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
                              title={
                                speakingMessageId === message.id
                                  ? "Stop voice"
                                  : "Read aloud"
                              }
                              onClick={() => {
                                if (speakingMessageId === message.id) {
                                  stopSpeaking()
                                } else {
                                  const fullText = message.parts
                                    ?.filter((p) => p.type === "text")
                                    .map((p: any) => p.text)
                                    .join(" ")
                                  if (fullText)
                                    speak(fullText, { messageId: message.id })
                                }
                              }}
                            >
                              {speakingMessageId === message.id ? (
                                <VolumeX className="size-3.5 animate-pulse text-destructive" />
                              ) : (
                                <Volume2 className="size-3.5" />
                              )}
                            </Button>
                            {speakingMessageId === message.id && (
                              <span className="animate-pulse text-[10px] font-medium text-primary">
                                Speaking...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <MessageContent
                        className={
                          isGroup && userTargetBot
                            ? hasNewlines
                              ? "group-[.is-user]:flex-row group-[.is-user]:items-start group-[.is-user]:gap-2.5 group-[.is-user]:px-3.5 group-[.is-user]:py-2.5"
                              : "group-[.is-user]:flex-row group-[.is-user]:items-center group-[.is-user]:gap-2.5 group-[.is-user]:px-3.5 group-[.is-user]:py-2"
                            : undefined
                        }
                      >
                        {isGroup && userTargetBot && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-black/25 px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-2xs select-none dark:bg-black/40",
                              hasNewlines && "mt-0.5"
                            )}
                          >
                            <ChatAvatar
                              seed={userTargetBot.avatar || userTargetBot.name}
                              alt={userTargetBot.name}
                              className="size-3.5 shrink-0 rounded-full"
                            />
                            <span className="max-w-[160px] truncate leading-none font-medium">
                              {userTargetBot.name}
                            </span>
                          </Badge>
                        )}
                        {message.parts?.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <span
                                key={`${message.id}-${i}`}
                                className="min-w-0 text-sm leading-relaxed break-words whitespace-pre-wrap"
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
                                onSendPrompt={handleSubmitText}
                              />
                            )
                          }

                          return null
                        })}
                      </MessageContent>
                      {isAssistant &&
                        message.parts?.some((p) => p.type === "text") && (
                          <div className="mt-1 flex items-center gap-1.5 opacity-60 transition-opacity hover:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="size-6 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
                              title={
                                speakingMessageId === message.id
                                  ? "Stop voice"
                                  : "Read aloud"
                              }
                              onClick={() => {
                                if (speakingMessageId === message.id) {
                                  stopSpeaking()
                                } else {
                                  const fullText = message.parts
                                    ?.filter((p) => p.type === "text")
                                    .map((p: any) => p.text)
                                    .join(" ")
                                  if (fullText)
                                    speak(fullText, { messageId: message.id })
                                }
                              }}
                            >
                              {speakingMessageId === message.id ? (
                                <VolumeX className="size-3.5 animate-pulse text-destructive" />
                              ) : (
                                <Volume2 className="size-3.5" />
                              )}
                            </Button>
                            {speakingMessageId === message.id && (
                              <span className="animate-pulse text-[10px] font-medium text-primary">
                                Speaking...
                              </span>
                            )}
                          </div>
                        )}
                    </>
                  )}
                </Message>
              )
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl shrink-0 p-4">
        {isSpeaking && (
          <div className="mb-2 flex animate-in items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs text-primary shadow-xs fade-in slide-in-from-bottom-1">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-primary"></span>
              </span>
              <span className="font-medium">JARVIS is speaking...</span>
            </div>
            <button
              type="button"
              onClick={stopSpeaking}
              className="flex cursor-pointer items-center gap-1 font-semibold text-primary transition-colors hover:text-destructive"
              title="Stop speaking (or press Escape)"
            >
              <span>Stop Speaking (Esc)</span>
            </button>
          </div>
        )}
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
              onChange={(e) => {
                if (isSpeaking) stopSpeaking()
                setInput(e.target.value)
              }}
            />
          </PromptInputBody>
          <PromptInputFooter className="items-center justify-between">
            <div className="flex items-center gap-2">
              {isGroup && bots && bots.length > 0 && (
                <PromptInputTools>
                  <PromptInputSelect
                    value={selectedBotId}
                    onValueChange={(val) => {
                      if (val) onSelectBotId(String(val))
                    }}
                  >
                    <PromptInputSelectTrigger className="h-8 gap-2 rounded-lg border border-input bg-transparent px-2.5 text-xs font-normal text-foreground hover:bg-muted">
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
                            <span className="text-xs font-medium">
                              {b.name}
                            </span>
                          </div>
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleAutoSpeak}
                title={
                  autoSpeak
                    ? "Voice Responses: ON (click to mute)"
                    : "Voice Responses: OFF (click to enable auto-voice)"
                }
                className={cn(
                  "size-8 cursor-pointer rounded-lg transition-colors",
                  autoSpeak
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {autoSpeak ? (
                  <Volume2 className="size-4 text-emerald-500" />
                ) : (
                  <VolumeX className="size-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <SpeechInput
                size="icon-sm"
                variant="ghost"
                className="size-8 cursor-pointer rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (isSpeaking) stopSpeaking()
                }}
                onTranscriptionChange={(transcribedText) => {
                  if (isSpeaking) stopSpeaking()
                  setInput((prev) =>
                    prev ? `${prev.trim()} ${transcribedText}` : transcribedText
                  )
                }}
              />
              <PromptInputSubmit
                disabled={!input.trim() && !isGenerating}
                status={status}
                onStop={handleStop}
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export const ChatView = Chat
