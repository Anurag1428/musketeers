import * as React from "react"
import Image, { type ImageProps } from "next/image"
import { Avatar, Style, type StyleDefinition } from "@dicebear/core"
import gazeDefinition from "@dicebear/styles/gaze.json"
import { cn } from "@/lib/utils"

const gazeStyle = new Style(gazeDefinition as unknown as StyleDefinition)

const avatarCache = new Map<string, string>()
const MAX_CACHE_SIZE = 500

function getAvatarDataUri(seed: string, animated: boolean): string {
  const cacheKey = `${seed}:${animated ? 1 : 0}`
  const cached = avatarCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const avatar = new Avatar(gazeStyle, {
    seed,
    ...(animated
      ? { animationVariant: ["fastest", "fast", "medium", "slow", "slowest"] }
      : { animationVariant: ["none"] }),
  })

  const uri = avatar.toDataUri()

  if (avatarCache.size >= MAX_CACHE_SIZE) {
    const firstKey = avatarCache.keys().next().value
    if (firstKey) {
      avatarCache.delete(firstKey)
    }
  }

  avatarCache.set(cacheKey, uri)
  return uri
}

export interface ChatAvatarProps extends Omit<
  ImageProps,
  "src" | "width" | "height" | "alt"
> {
  seed: string
  animated?: boolean
  className?: string
  alt?: string
  width?: number
  height?: number
}

export function ChatAvatar({
  seed,
  animated = false,
  className,
  alt,
  width = 32,
  height = 32,
  unoptimized = true,
  ...props
}: ChatAvatarProps) {
  const avatarSrc = getAvatarDataUri(String(seed ?? ""), Boolean(animated))

  return (
    <Image
      src={avatarSrc}
      alt={alt ?? `${seed ?? "Chat"} avatar`}
      width={width}
      height={height}
      unoptimized={unoptimized}
      className={cn("size-8", className)}
      {...props}
    />
  )
}

export const chatAvatar = ChatAvatar
export default ChatAvatar
