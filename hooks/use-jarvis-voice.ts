"use client"

import * as React from "react"

/**
 * Strips markdown and extracts a clean, spoken version of text.
 * If `isAuto` is true, extracts a concise, conversational 1-3 sentence summary
 * instead of reading an entire multi-page report like a tape recorder.
 */
export function cleanTextForSpeech(text: string, isAuto = false): string {
  if (!text) return ""

  let clean = text

  // In auto-speak mode, extract the conversational response (skip massive tables/reports)
  if (isAuto) {
    // If there is an introductory conversational paragraph before markdown headers/lists:
    const sections = clean.split(
      /\n#{1,6}\s+|\n(?=[-*+]\s)|\n(?=\d+\.\s)|\n(?=\|)/
    )
    const firstSection = sections[0]?.trim()

    if (firstSection && firstSection.length > 20) {
      clean = firstSection
      // If there was substantial technical content after the intro, add a natural sign-off
      if (sections.length > 1 || text.length > firstSection.length + 80) {
        clean +=
          ". I have displayed the complete details and report on your screen, sir."
      }
    } else {
      // Limit auto-speak to the first ~300 characters / ~2 sentences
      const sentenceMatch = clean.match(/^(?:[\s\S]*?[.!?](?:\s|$)){1,2}/)
      if (sentenceMatch && sentenceMatch[0].length >= 30) {
        clean =
          sentenceMatch[0] + " I have displayed the rest on your screen, sir."
      }
    }
  }

  return (
    clean
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove markdown links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove markdown headers, bold, italics, bullets, blockquotes
      .replace(/[#*_~>]/g, "")
      // Remove table formatting
      .replace(/\|[-:\s|]+\|/g, "")
      .replace(/\|/g, ", ")
      // Clean up excessive whitespace
      .replace(/\s+/g, " ")
      .trim()
  )
}

/**
 * Splits text into natural sentence-level chunks so that Chromium doesn't buffer
 * an entire document into an un-cancellable audio stream.
 */
function splitIntoSentences(text: string): string[] {
  const chunks = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return chunks.length > 0 ? chunks : [text]
}

/**
 * Cancels speech synthesis reliably, working around Chromium/Chrome pause bugs.
 */
function forceCancelSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return
  try {
    window.speechSynthesis.cancel()
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
      window.speechSynthesis.cancel()
    }
  } catch (err) {
    console.error("Speech cancellation error:", err)
  }
}

export function useJarvisVoice() {
  const [isSpeaking, setIsSpeaking] = React.useState(false)
  const [autoSpeak, setAutoSpeak] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("jarvis_auto_speak") === "true"
    }
    return false
  })
  const [speakingMessageId, setSpeakingMessageId] = React.useState<
    string | null
  >(null)
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])

  const isCancelledRef = React.useRef(false)
  const queueRef = React.useRef<string[]>([])
  const currentUtteranceRef = React.useRef<SpeechSynthesisUtterance | null>(
    null
  )

  // Load available browser voices
  React.useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return

    const updateVoices = () => {
      const available = window.speechSynthesis.getVoices()
      if (available.length > 0) {
        setVoices(available)
      }
    }

    updateVoices()
    window.speechSynthesis.onvoiceschanged = updateVoices

    return () => {
      forceCancelSpeech()
    }
  }, [])

  // Immediate Interruption
  const stopSpeaking = React.useCallback(() => {
    isCancelledRef.current = true
    queueRef.current = []
    currentUtteranceRef.current = null
    forceCancelSpeech()
    setIsSpeaking(false)
    setSpeakingMessageId(null)
  }, [])

  // Listen for Escape key to instantly interrupt speech anywhere
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSpeaking) {
        stopSpeaking()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isSpeaking, stopSpeaking])

  const toggleAutoSpeak = React.useCallback(() => {
    stopSpeaking()
    setAutoSpeak((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        localStorage.setItem("jarvis_auto_speak", String(next))
      }
      return next
    })
  }, [stopSpeaking])

  const speak = React.useCallback(
    (
      text: string,
      options?: {
        messageId?: string
        isAuto?: boolean
      }
    ) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return

      const { messageId, isAuto = false } = options ?? {}

      // Hard-reset any ongoing speech
      stopSpeaking()

      const clean = cleanTextForSpeech(text, isAuto)
      if (!clean) return

      const sentences = splitIntoSentences(clean)
      if (sentences.length === 0) return

      isCancelledRef.current = false
      queueRef.current = [...sentences]
      setIsSpeaking(true)
      if (messageId) setSpeakingMessageId(messageId)

      // Resolve best natural UK/US male voice for JARVIS
      const voiceList =
        voices.length > 0 ? voices : window.speechSynthesis.getVoices()
      const preferredVoice =
        voiceList.find(
          (v) =>
            v.name.includes("UK English Male") ||
            v.name.includes("George") ||
            v.name.includes("Oliver") ||
            v.name.includes("Daniel")
        ) ||
        voiceList.find((v) => v.lang.startsWith("en-GB")) ||
        voiceList.find(
          (v) =>
            v.name.includes("Natural") ||
            v.name.includes("Google US English") ||
            v.name.includes("David")
        ) ||
        voiceList.find((v) => v.lang.startsWith("en"))

      const playNextChunk = () => {
        if (isCancelledRef.current || queueRef.current.length === 0) {
          setIsSpeaking(false)
          setSpeakingMessageId(null)
          currentUtteranceRef.current = null
          return
        }

        const nextText = queueRef.current.shift()
        if (!nextText) {
          playNextChunk()
          return
        }

        const utterance = new SpeechSynthesisUtterance(nextText)
        currentUtteranceRef.current = utterance
        utterance.rate = 1.05
        utterance.pitch = 1.0

        if (preferredVoice) {
          utterance.voice = preferredVoice
        }

        utterance.onend = () => {
          if (!isCancelledRef.current) {
            playNextChunk()
          }
        }

        utterance.onerror = () => {
          if (!isCancelledRef.current) {
            playNextChunk()
          }
        }

        window.speechSynthesis.speak(utterance)
      }

      playNextChunk()
    },
    [voices, stopSpeaking]
  )

  return {
    isSpeaking,
    autoSpeak,
    speakingMessageId,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
  }
}
