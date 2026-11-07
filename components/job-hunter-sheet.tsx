"use client"

import * as React from "react"
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  Monitor,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react"

import {
  deleteStartupLead,
  getStartupLeads,
  openLeadInDesktopBrowser,
} from "@/actions/job-hunter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import type { StartupLead } from "@/lib/db/schema"

export interface JobHunterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  botId?: string
  botContainerName?: string
  onSendPrompt?: (prompt: string) => void
}

export function JobHunterSheet({
  open,
  onOpenChange,
  botId,
  onSendPrompt,
}: JobHunterSheetProps) {
  const [leads, setLeads] = React.useState<StartupLead[]>([])
  const [isLoadingLeads, setIsLoadingLeads] = React.useState(false)
  const [searchFilter, setSearchFilter] = React.useState("")
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [openingLeadId, setOpeningLeadId] = React.useState<string | null>(null)

  // Load existing leads when sheet opens
  React.useEffect(() => {
    if (!open) return
    let isMounted = true
    setIsLoadingLeads(true)
    getStartupLeads(botId)
      .then((data) => {
        if (isMounted) {
          setLeads(data)
          setIsLoadingLeads(false)
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingLeads(false)
      })
    return () => {
      isMounted = false
    }
  }, [open, botId])

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

  const handleOpenDesktop = async (lead: StartupLead) => {
    try {
      setOpeningLeadId(lead.id)
      await openLeadInDesktopBrowser(lead.linkedinXrayUrl)
      toast.add({
        title: "Launched on Desktop",
        description: `Opened ${lead.startupName} founder search in Chromium.`,
        type: "success",
      })
    } catch (err) {
      toast.add({
        title: "Desktop Error",
        description:
          err instanceof Error
            ? err.message
            : "Could not open browser on desktop.",
        type: "error",
      })
    } finally {
      setOpeningLeadId(null)
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    try {
      await deleteStartupLead(leadId)
      setLeads((prev) => prev.filter((l) => l.id !== leadId))
      toast.add({
        title: "Lead removed",
        description: "The startup lead has been removed.",
        type: "success",
      })
    } catch {
      toast.add({
        title: "Delete failed",
        description: "Failed to delete lead.",
        type: "error",
      })
    }
  }

  const filteredLeads = React.useMemo(() => {
    if (!searchFilter.trim()) return leads
    const q = searchFilter.toLowerCase()
    return leads.filter(
      (l) =>
        l.startupName.toLowerCase().includes(q) ||
        l.founderName.toLowerCase().includes(q) ||
        l.domain.toLowerCase().includes(q) ||
        l.fundingRound.toLowerCase().includes(q)
    )
  }, [leads, searchFilter])

  const quickPrompts = [
    {
      title: "AI Seed Rounds",
      query: "Find 5 AI startups that raised Seed or Pre-Seed funding in the past 5-7 days. Include founder LinkedIn URLs and draft cold pitches.",
      badge: "Past Week",
    },
    {
      title: "In-Talks / Rumoured Deals",
      query: "Find 3 tech startups rumoured or in talks to raise funding in the past week. Provide their decision makers and verified emails.",
      badge: "Rumours",
    },
    {
      title: "Series A Momentum",
      query: "Find 4 fast-growing startups that announced Series A funding in the past 7 days, get their founders' direct LinkedIn profiles, and draft personalized outreach.",
      badge: "Series A",
    },
    {
      title: "India Ecosystem",
      query: "Find 4 Indian tech startups that announced funding in the past 7 days, check their MX records, and draft outreach notes.",
      badge: "India / Inc42",
    },
  ]

  const handleTriggerPrompt = (query: string) => {
    if (onSendPrompt) {
      onSendPrompt(query)
      onOpenChange(false)
      toast.add({
        title: "Agent Prompted",
        description: "Your personal agent is researching startups in chat.",
        type: "info",
      })
    } else {
      navigator.clipboard.writeText(query)
      toast.add({
        title: "Prompt Copied",
        description: "Paste into the chat box to ask your agent.",
        type: "success",
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md w-full flex flex-col p-0 overflow-hidden"
      >
        <SheetHeader className="p-4 border-b shrink-0 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Rocket className="size-4" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">
                Radar & Saved Leads
              </SheetTitle>
              <SheetDescription className="text-xs">
                Startups scouted by your personal AI agent.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="leads" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-2 border-b shrink-0 bg-muted/20">
            <TabsList className="grid grid-cols-2 w-full h-8">
              <TabsTrigger value="leads" className="text-xs gap-1.5">
                Saved Leads
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {leads.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="prompts" className="text-xs gap-1.5">
                <Sparkles className="size-3 text-primary" />
                Agent Radar Prompts
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: SAVED LEADS */}
          <TabsContent
            value="leads"
            className="flex-1 flex flex-col min-h-0 m-0 p-0"
          >
            <div className="p-3 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by company, founder, or round..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingLeads ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Spinner className="size-5" />
                  <span className="text-xs">Loading scouted leads...</span>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-xl border-dashed p-6">
                  <Rocket className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium">No saved leads yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs mt-1">
                    Ask your personal agent in chat to scout startups, or pick a
                    quick prompt from the &quot;Agent Radar Prompts&quot; tab!
                  </p>
                </div>
              ) : (
                filteredLeads.map((lead) => {
                  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    lead.verifiedEmail
                  )}&su=${encodeURIComponent(
                    lead.emailSubject
                  )}&body=${encodeURIComponent(lead.emailBody)}`

                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border bg-card/60 p-3.5 space-y-2.5 shadow-xs text-xs"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {lead.startupName}
                            </span>
                            <a
                              href={`https://${lead.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:underline flex items-center gap-0.5 text-[11px]"
                            >
                              {lead.domain}
                              <ExternalLink className="size-2.5" />
                            </a>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {lead.fundingRound} ({lead.fundingAmount})
                            </Badge>
                            {lead.announcedDate && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted-foreground gap-0.5"
                              >
                                <Calendar className="size-2.5" />
                                {lead.announcedDate}
                              </Badge>
                            )}
                            {lead.isRumoured ? (
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
                            {lead.mxVerified && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              >
                                <CheckCircle2 className="size-2.5" />
                                MX
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleOpenDesktop(lead)}
                            disabled={openingLeadId === lead.id}
                            title="Open in Desktop Browser"
                          >
                            <Monitor className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeleteLead(lead.id)}
                            title="Delete Lead"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Product Summary */}
                      {lead.productSummary && (
                        <p className="text-muted-foreground line-clamp-2 leading-relaxed text-[11px]">
                          {lead.productSummary}
                        </p>
                      )}

                      {/* Founder Info */}
                      <div className="bg-muted/40 p-2 rounded-lg border flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            {lead.founderName}
                            <span className="text-muted-foreground font-normal ml-1">
                              ({lead.founderRole})
                            </span>
                          </span>
                          <a
                            href={lead.linkedinXrayUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-0.5 text-[11px] font-medium"
                          >
                            LinkedIn
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                        <div className="flex items-center justify-between">
                          <code className="font-mono text-primary bg-primary/5 px-1 py-0.5 rounded text-[11px]">
                            {lead.verifiedEmail}
                          </code>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  lead.verifiedEmail,
                                  `em-${lead.id}`,
                                  "Email"
                                )
                              }
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Copy Email"
                            >
                              {copiedKey === `em-${lead.id}` ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                            <a
                              href={gmailUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-primary"
                              title="Compose Gmail"
                            >
                              <Mail className="size-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>

          {/* TAB 2: AGENT RADAR PROMPTS */}
          <TabsContent
            value="prompts"
            className="flex-1 overflow-y-auto p-4 space-y-3 m-0"
          >
            <div className="text-xs text-muted-foreground space-y-1 mb-3">
              <p className="font-medium text-foreground">
                One-Click Agent Commands
              </p>
              <p>
                Trigger your personal agent directly in chat using any of these
                presets. The agent will scout live funding with Firecrawl and
                return interactive cards in your conversation.
              </p>
            </div>

            <div className="space-y-2.5">
              {quickPrompts.map((qp, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border bg-card/60 p-3.5 space-y-2 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-foreground">
                      {qp.title}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {qp.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    &ldquo;{qp.query}&rdquo;
                  </p>
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleTriggerPrompt(qp.query)}
                      className="cursor-pointer gap-1"
                    >
                      <Rocket className="size-3 text-primary" />
                      Ask Personal Agent
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

export default JobHunterSheet
