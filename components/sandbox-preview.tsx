"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import { AlertCircle, Maximize2, Monitor, RotateCw, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchSandboxVncUrl } from "@/actions/sandbox"

export interface SandboxPreviewProps {
  sandboxId?: string | null
  botName?: string
  initialUrl?: string | null
}

export function SandboxPreview({
  sandboxId,
  botName = "Bot",
  initialUrl = null,
}: SandboxPreviewProps) {
  const [mounted, setMounted] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(initialUrl)
  const [baseUrl, setBaseUrl] = React.useState<string | null>(() => {
    if (initialUrl) {
      try {
        const u = new URL(initialUrl)
        return `${u.protocol}//${u.host}`
      } catch {
        return null
      }
    }
    return null
  })
  const [isLoading, setIsLoading] = React.useState(!initialUrl && Boolean(sandboxId))
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [iframeKey, setIframeKey] = React.useState(0)

  // Anchor element in the resizable panel
  const [placeholderEl, setPlaceholderEl] = React.useState<HTMLDivElement | null>(null)
  const [rect, setRect] = React.useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)

  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const formRef = React.useRef<HTMLFormElement | null>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Continuously track placeholderEl position and size
  React.useEffect(() => {
    if (!placeholderEl) return

    const updateRect = () => {
      const r = placeholderEl.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setRect({
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        })
      }
    }

    updateRect()
    const rafId = requestAnimationFrame(updateRect)
    const timeoutId = setTimeout(updateRect, 100)

    const observer = new ResizeObserver(() => {
      updateRect()
    })
    observer.observe(placeholderEl)

    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(timeoutId)
      observer.disconnect()
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [placeholderEl])

  // Re-measure placeholder whenever fullscreen toggles off
  React.useEffect(() => {
    if (!isFullscreen && placeholderEl) {
      const r = placeholderEl.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setRect({
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        })
      }
    }
  }, [isFullscreen, placeholderEl])

  // Fetch VNC URL when sandboxId is present and no url yet
  React.useEffect(() => {
    if (!sandboxId) {
      setIsLoading(false)
      return
    }

    if (url) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchSandboxVncUrl(sandboxId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.url) {
          setUrl(res.url)
          setBaseUrl(res.baseUrl ?? null)
          setError(null)
        } else {
          setError(res.error || "Failed to load Daytona VNC preview")
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Error connecting to sandbox"
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [sandboxId, url])

  // Auto-submit warning acceptance form to set Daytona bypass cookie
  React.useEffect(() => {
    if (url && baseUrl && formRef.current) {
      try {
        formRef.current.submit()
      } catch (e) {
        console.warn("Could not auto-submit Daytona warning bypass form:", e)
      }
    }
  }, [url, baseUrl, iframeKey])

  const handleRefresh = async () => {
    if (!sandboxId) return
    setIsRefreshing(true)
    setError(null)

    try {
      const res = await fetchSandboxVncUrl(sandboxId)
      if (res.success && res.url) {
        setUrl(res.url)
        setBaseUrl(res.baseUrl ?? null)
        setIframeKey((prev) => prev + 1)
        setError(null)
      } else {
        setError(res.error || "Failed to refresh VNC preview")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error refreshing VNC")
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleOpenChange = (
    nextOpen: boolean,
    eventDetails: DialogPrimitive.Root.ChangeEventDetails
  ) => {
    if (!nextOpen) {
      // Prevent dialog from being closed by any hotkeys (Escape) or outside pointer presses
      if (
        eventDetails.reason === "escape-key" ||
        eventDetails.reason === "outside-press" ||
        eventDetails.reason === "focus-out"
      ) {
        return
      }
      setIsFullscreen(false)
    } else {
      setIsFullscreen(true)
    }
  }

  const iframeName = `daytona-vnc-frame-${sandboxId ?? "default"}`

  return (
    <div className="flex h-full w-full flex-col bg-background/50 overflow-hidden">
      {/* Top panel bar with refresh button matching user's image */}
      <div className="flex h-12 shrink-0 items-center justify-end px-4 border-b border-border/40">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={handleRefresh}
          disabled={!sandboxId || isRefreshing}
          title="Refresh screen"
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <RotateCw className={cn(isRefreshing && "animate-spin")} />
          <span className="sr-only">Refresh screen</span>
        </Button>
      </div>

      {/* Main panel content: Device Mockup Preview & Bot label */}
      <div className="flex flex-1 flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="flex flex-col items-center w-full max-w-sm sm:max-w-md">
          {/* Device Mockup Frame */}
          <div className="relative w-full aspect-[4/3] rounded-2xl border-2 border-border/50 bg-zinc-900/90 p-2 sm:p-3 shadow-xl overflow-hidden flex items-center justify-center">
            {/* Permanent placeholder anchor measured by ResizeObserver */}
            <div
              ref={setPlaceholderEl}
              className="relative w-full h-full rounded-lg bg-black overflow-hidden flex items-center justify-center"
            >
              {!sandboxId ? (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground p-4 text-center">
                  <Monitor className="size-8 text-muted-foreground/30" />
                  <span className="text-xs">No sandbox ID provisioned</span>
                </div>
              ) : isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground p-4 text-center">
                  <Spinner className="size-6" />
                  <span className="text-xs">Connecting to Daytona sandbox...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-2.5 text-muted-foreground p-4 text-center">
                  <AlertCircle className="size-6 text-destructive" />
                  <span className="text-xs text-destructive max-w-xs">{error}</span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleRefresh}
                    className="mt-1"
                  >
                    Retry
                  </Button>
                </div>
              ) : isFullscreen ? (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-center p-4">
                  <Monitor className="size-8 text-muted-foreground/40 animate-pulse" />
                  <span className="text-xs font-medium">Screen open in fullscreen</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Label below preview as in user's image */}
          <p className="mt-4 text-center text-sm font-medium text-muted-foreground">
            {botName}&apos;s screen
          </p>
        </div>
      </div>

      {/* Accessible Dialog Portal for Fullscreen overlay */}
      <Dialog
        open={isFullscreen}
        onOpenChange={handleOpenChange}
        disablePointerDismissal
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            className="sr-only"
            tabIndex={-1}
            initialFocus={false}
          >
            <DialogTitle>{botName}&apos;s Desktop</DialogTitle>
            <DialogDescription>
              Daytona VNC sandbox interactive session
            </DialogDescription>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>

      {/*
        Persistent Iframe Container - Portaled to document.body:
        1. Immune to react-resizable-panels' transform/contain constraints
        2. Sits above DialogOverlay (z-[60] vs z-50) when fullscreen
        3. Stays in the exact same DOM node so VNC session never reloads or drops WebSocket
      */}
      {mounted && url && createPortal(
        <div
          className={cn(
            "overflow-hidden bg-black",
            isFullscreen
              ? "fixed inset-3 sm:inset-6 md:inset-8 z-[60] flex flex-col rounded-2xl border bg-background shadow-2xl ring-1 ring-foreground/10"
              : "fixed z-40 rounded-lg shadow-md transition-all duration-75"
          )}
          style={
            isFullscreen
              ? undefined
              : {
                  top: rect?.top ?? 0,
                  left: rect?.left ?? 0,
                  width: rect?.width ?? 0,
                  height: rect?.height ?? 0,
                  opacity: rect && rect.width > 0 ? 1 : 0,
                }
          }
          onKeyDown={(e) => {
            // Prevent hotkeys from bubbling outside when in fullscreen
            if (isFullscreen) {
              e.stopPropagation()
            }
          }}
        >
          {/* Form auto-submits POST to Daytona to bypass the warning page & set cookie */}
          {baseUrl && (
            <form
              ref={formRef}
              method="POST"
              action={`${baseUrl}/accept-daytona-preview-warning?redirect=${encodeURIComponent(url)}`}
              target={iframeName}
              className="hidden"
            />
          )}

          {/* Fullscreen header with controls */}
          {isFullscreen && (
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 bg-muted/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium text-sm truncate text-foreground">
                  {botName}&apos;s Desktop
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title="Refresh screen"
                  className="cursor-pointer"
                >
                  <RotateCw className={cn(isRefreshing && "animate-spin")} />
                  <span className="sr-only">Refresh desktop</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  title="Close fullscreen"
                  className="cursor-pointer"
                >
                  <XIcon />
                  <span className="sr-only">Close fullscreen</span>
                </Button>
              </div>
            </div>
          )}

          {/* Iframe Viewport: interactive in fullscreen, display-only in preview */}
          <div className="relative flex-1 w-full h-full min-h-0 bg-black flex items-center justify-center">
            <iframe
              key={iframeKey}
              ref={iframeRef}
              name={iframeName}
              src={url}
              title={`${botName}'s Daytona Desktop`}
              className={cn(
                "w-full h-full border-0 select-none bg-black",
                isFullscreen ? "pointer-events-auto" : "pointer-events-none"
              )}
              allow="clipboard-read; clipboard-write; fullscreen"
            />

            {/* In preview mode: click overlay button inside the portaled container */}
            {!isFullscreen && (
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center group/screen bg-transparent hover:bg-black/20 transition-colors"
                title="Click to open fullscreen"
              >
                <span className="opacity-0 group-hover/screen:opacity-100 transition-opacity px-2.5 py-1 rounded-full bg-background/90 text-foreground text-xs font-medium shadow-md border backdrop-blur-xs flex items-center gap-1.5 pointer-events-none">
                  <Maximize2 className="size-3.5" />
                  Click to open fullscreen
                </span>
                <span className="sr-only">
                  Open {botName}&apos;s screen fullscreen
                </span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default SandboxPreview
