"use client"

import * as React from "react"
import { RotateCw, Monitor, Zap } from "lucide-react"

export default function DesktopPreviewPage() {
  const [imgSrc] = React.useState<string>("/api/desktop/screenshot")
  const [timestamp, setTimestamp] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const imgRef = React.useRef<HTMLImageElement | null>(null)

  const refreshScreen = React.useCallback(() => {
    setIsLoading(true)
    setTimestamp(Date.now())
  }, [])

  // Initialize timestamp on client mount to eliminate SSR hydration mismatch
  React.useEffect(() => {
    setTimestamp(Date.now())
  }, [])

  React.useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      setTimestamp(Date.now())
    }, 2500)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleImageLoad = () => {
    setIsLoading(false)
  }

  // Handle clicking on the desktop to interact directly from the laptop!
  const handleDesktopClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    // Calculate click percentage across the image
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height

    // Assuming Ubuntu 1440x900 resolution
    const screenX = Math.round(relX * 1440)
    const screenY = Math.round(relY * 900)

    try {
      await fetch("/api/desktop/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: screenX, y: screenY }),
      })
      // Refresh shortly after click to reflect UI state
      setTimeout(refreshScreen, 300)
    } catch (err) {
      console.error("Failed to forward click:", err)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-white select-none">
      {/* Top control bar */}
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex size-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-medium text-zinc-300">
            Ubuntu 24.04 (192.168.1.12)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="size-3 rounded border-zinc-700 bg-zinc-900 text-emerald-500"
            />
            <span>Live Stream</span>
          </label>
          <button
            type="button"
            onClick={refreshScreen}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
          >
            <RotateCw
              className={`size-3 ${isLoading ? "animate-spin text-emerald-400" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main desktop screen display */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={timestamp ? `${imgSrc}?t=${timestamp}` : imgSrc}
          alt="JARVIS Ubuntu Desktop"
          onLoad={handleImageLoad}
          onClick={handleDesktopClick}
          className="max-h-full max-w-full cursor-crosshair rounded border border-zinc-800/60 object-contain shadow-2xl"
        />
      </div>
    </div>
  )
}
