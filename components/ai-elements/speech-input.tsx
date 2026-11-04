"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { MicIcon, SquareIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult:
    ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror:
    ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none"

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>
  lang?: string
}

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") {
    return "none"
  }

  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    return "speech-recognition"
  }

  if ("MediaRecorder" in window && "mediaDevices" in navigator) {
    return "media-recorder"
  }

  return "none"
}

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  onClick: externalOnClick,
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mode, setMode] = useState<SpeechInputMode>("none")
  const [isRecognitionReady, setIsRecognitionReady] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const onTranscriptionChangeRef = useRef<
    SpeechInputProps["onTranscriptionChange"]
  >(onTranscriptionChange)
  const onAudioRecordedRef =
    useRef<SpeechInputProps["onAudioRecorded"]>(onAudioRecorded)

  // Keep callback refs fresh
  onTranscriptionChangeRef.current = onTranscriptionChange
  onAudioRecordedRef.current = onAudioRecorded

  // Detect mode after client hydration
  useEffect(() => {
    setMode(detectSpeechInputMode())
  }, [])

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== "speech-recognition") {
      return
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) return

      const speechRecognition = new SpeechRecognition()
      speechRecognition.continuous = true
      speechRecognition.interimResults = true
      speechRecognition.lang = lang

      const handleStart = () => {
        setIsListening(true)
      }

      const handleEnd = () => {
        setIsListening(false)
      }

      const handleResult = (event: Event) => {
        const speechEvent = event as SpeechRecognitionEvent
        let finalTranscript = ""

        for (
          let i = speechEvent.resultIndex;
          i < speechEvent.results.length;
          i += 1
        ) {
          const result = speechEvent.results[i]
          if (result.isFinal) {
            finalTranscript += result[0]?.transcript ?? ""
          }
        }

        if (finalTranscript) {
          onTranscriptionChangeRef.current?.(finalTranscript)
        }
      }

      const handleError = (e: Event) => {
        const errorEvent = e as SpeechRecognitionErrorEvent
        console.warn("Speech recognition error:", errorEvent.error)
        if (
          errorEvent.error === "not-allowed" ||
          errorEvent.error === "service-not-allowed"
        ) {
          toast.add({
            title: "Microphone Access Required",
            description:
              "Please allow microphone access in your browser to speak with JARVIS.",
            type: "error",
          })
        }
        if (errorEvent.error !== "no-speech") {
          setIsListening(false)
        }
      }

      speechRecognition.addEventListener("start", handleStart)
      speechRecognition.addEventListener("end", handleEnd)
      speechRecognition.addEventListener("result", handleResult)
      speechRecognition.addEventListener("error", handleError)

      recognitionRef.current = speechRecognition
      setIsRecognitionReady(true)

      return () => {
        speechRecognition.removeEventListener("start", handleStart)
        speechRecognition.removeEventListener("end", handleEnd)
        speechRecognition.removeEventListener("result", handleResult)
        speechRecognition.removeEventListener("error", handleError)
        try {
          speechRecognition.stop()
        } catch {}
        recognitionRef.current = null
        setIsRecognitionReady(false)
      }
    } catch (err) {
      console.error("Failed to initialize SpeechRecognition:", err)
    }
  }, [mode, lang])

  // Cleanup MediaRecorder and stream on unmount
  useEffect(
    () => () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop()
        }
      }
    },
    []
  )

  // Start MediaRecorder recording fallback
  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecordedRef.current) {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      const handleStop = async () => {
        for (const track of stream.getTracks()) {
          track.stop()
        }
        streamRef.current = null

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        })

        if (audioBlob.size > 0 && onAudioRecordedRef.current) {
          setIsProcessing(true)
          try {
            const transcript = await onAudioRecordedRef.current(audioBlob)
            if (transcript) {
              onTranscriptionChangeRef.current?.(transcript)
            }
          } catch {
            // Error handling delegated to caller
          } finally {
            setIsProcessing(false)
          }
        }
      }

      const handleError = () => {
        setIsListening(false)
        for (const track of stream.getTracks()) {
          track.stop()
        }
        streamRef.current = null
      }

      mediaRecorder.addEventListener("dataavailable", handleDataAvailable)
      mediaRecorder.addEventListener("stop", handleStop)
      mediaRecorder.addEventListener("error", handleError)

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }, [])

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition") {
      if (recognitionRef.current) {
        if (isListening) {
          try {
            recognitionRef.current.stop()
          } catch {}
          setIsListening(false)
        } else {
          try {
            recognitionRef.current.start()
            setIsListening(true)
          } catch (err) {
            console.warn("SpeechRecognition start retry:", err)
            try {
              recognitionRef.current.stop()
              setTimeout(() => {
                recognitionRef.current?.start()
                setIsListening(true)
              }, 100)
            } catch {}
          }
        }
      }
    } else if (mode === "media-recorder") {
      if (isListening) {
        stopMediaRecorder()
      } else {
        startMediaRecorder()
      }
    }
  }, [mode, isListening, startMediaRecorder, stopMediaRecorder])

  // Combined click handler so external onClick doesn't overwrite toggleListening
  const handleClick = useCallback(
    (e: any) => {
      externalOnClick?.(e)
      toggleListening()
    },
    [externalOnClick, toggleListening]
  )

  // Determine if button should be disabled
  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !isRecognitionReady) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isProcessing

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Animated pulse rings when recording */}
      {isListening &&
        [0, 1, 2].map((index) => (
          <div
            className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-red-500/40"
            key={index}
            style={{
              animationDelay: `${index * 0.3}s`,
              animationDuration: "2s",
            }}
          />
        ))}

      {/* Main record button */}
      <Button
        variant={isListening ? "destructive" : (props.variant ?? "ghost")}
        className={cn(
          "relative z-10 transition-all duration-300",
          isListening
            ? "!text-destructive-foreground animate-pulse !bg-destructive shadow-md shadow-destructive/20 hover:!bg-destructive/90"
            : "",
          className
        )}
        disabled={isDisabled}
        onClick={handleClick}
        title={
          isListening
            ? "Listening... Click to stop recording"
            : isDisabled
              ? "Microphone not available"
              : "Click to speak"
        }
        {...props}
      >
        {isProcessing && <Spinner />}
        {!isProcessing && isListening && <SquareIcon className="size-4" />}
        {!(isProcessing || isListening) && <MicIcon className="size-4" />}
      </Button>
    </div>
  )
}
