"use client"

import * as React from "react"
import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"

export interface GroupChatAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  bots?: Array<{ avatar?: string | null; name?: string | null } | null> | null
  seeds?: string[]
  className?: string
  alt?: string
}

export function GroupChatAvatar({
  bots,
  seeds,
  className,
  alt = "Group avatar",
  ...props
}: GroupChatAvatarProps) {
  const avatarSeeds = React.useMemo(() => {
    if (seeds && seeds.length > 0) {
      return seeds.filter(Boolean)
    }
    if (bots && bots.length > 0) {
      return bots
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map((b) => b.avatar || b.name || "bot")
    }
    return []
  }, [seeds, bots])

  const count = avatarSeeds.length

  // Fallback or single avatar
  if (count <= 1) {
    return (
      <ChatAvatar
        seed={avatarSeeds[0] ?? "group"}
        alt={alt}
        className={cn("size-8", className)}
      />
    )
  }

  // 2 items: "Two items sit side by side, overlapping"
  if (count === 2) {
    return (
      <div
        className={cn(
          "relative size-8 shrink-0 select-none overflow-hidden rounded-md",
          className
        )}
        aria-label={alt}
        {...props}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 size-[64%] rounded-full ring-2 ring-background z-10 overflow-hidden">
          <ChatAvatar
            seed={avatarSeeds[0]}
            className="size-full object-cover"
          />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 size-[64%] rounded-full ring-2 ring-background z-0 overflow-hidden">
          <ChatAvatar
            seed={avatarSeeds[1]}
            className="size-full object-cover"
          />
        </div>
      </div>
    )
  }

  // 3 items: "three form a triangle"
  if (count === 3) {
    return (
      <div
        className={cn(
          "relative size-8 shrink-0 select-none overflow-hidden rounded-md",
          className
        )}
        aria-label={alt}
        {...props}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 size-[54%] rounded-full ring-1.5 ring-background z-10 overflow-hidden">
          <ChatAvatar
            seed={avatarSeeds[0]}
            className="size-full object-cover"
          />
        </div>
        <div className="absolute bottom-0 left-[2%] size-[54%] rounded-full ring-1.5 ring-background z-0 overflow-hidden">
          <ChatAvatar
            seed={avatarSeeds[1]}
            className="size-full object-cover"
          />
        </div>
        <div className="absolute bottom-0 right-[2%] size-[54%] rounded-full ring-1.5 ring-background z-0 overflow-hidden">
          <ChatAvatar
            seed={avatarSeeds[2]}
            className="size-full object-cover"
          />
        </div>
      </div>
    )
  }

  // 4 or more items: "four fill a 2*2 grid - features upto 3 visible bot avatars, and the rest is shown with a number"
  return (
    <div
      className={cn(
        "grid grid-cols-2 grid-rows-2 size-8 shrink-0 select-none p-0.5 gap-0.5 overflow-hidden rounded-md bg-muted/20",
        className
      )}
      aria-label={alt}
      {...props}
    >
      <div className="size-full rounded-full overflow-hidden flex items-center justify-center">
        <ChatAvatar
          seed={avatarSeeds[0]}
          className="size-full object-cover"
        />
      </div>
      <div className="size-full rounded-full overflow-hidden flex items-center justify-center">
        <ChatAvatar
          seed={avatarSeeds[1]}
          className="size-full object-cover"
        />
      </div>
      <div className="size-full rounded-full overflow-hidden flex items-center justify-center">
        <ChatAvatar
          seed={avatarSeeds[2]}
          className="size-full object-cover"
        />
      </div>
      <div className="size-full rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-semibold text-muted-foreground leading-none">
        +{count - 3}
      </div>
    </div>
  )
}

export default GroupChatAvatar
