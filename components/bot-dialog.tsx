"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Shuffle } from "lucide-react"

import { createBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Bot } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

const PRESETS = [
  {
    label: "Research assistant",
    name: "Ada",
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    label: "Code reviewer",
    name: "Linus",
    job: "Code reviewer",
    instructions:
      "Review code for bugs, performance, security, and best practices. Provide constructive feedback.",
  },
  {
    label: "Writing editor",
    name: "Hemingway",
    job: "Writing editor",
    instructions:
      "Edit and polish text for clarity, tone, flow, and grammar. Suggest succinct improvements.",
  },
  {
    label: "Tutor",
    name: "Socrates",
    job: "Tutor",
    instructions:
      "Explain concepts simply, provide step-by-step guidance, and test understanding.",
  },
] as const

const botFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  job: z.string().min(1, "Job is required"),
  instructions: z.string().optional(),
  avatar: z.string().min(1, "Avatar is required"),
})

export type BotFormValues = z.infer<typeof botFormSchema>

export interface BotDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  onSuccess?: (bot: Bot) => void
}

export function BotDialog({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  children,
  onSuccess,
}: BotDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = isControlled ? setControlledOpen : setUncontrolledOpen

  const [selectedPreset, setSelectedPreset] = React.useState<string>(
    PRESETS[0].label
  )

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BotFormValues>({
    resolver: zodResolver(botFormSchema),
    defaultValues: {
      name: PRESETS[0].name,
      job: PRESETS[0].job,
      instructions: PRESETS[0].instructions,
      avatar: "ada-seed",
    },
  })

  // Watch avatar to update avatar preview dynamically
  const avatarSeed = useWatch({ control, name: "avatar" })

  const handleShuffle = () => {
    const newSeed = crypto.randomUUID()
    setValue("avatar", newSeed, { shouldValidate: true })
  }

  const handleSelectPreset = (presetLabel: string) => {
    const preset = PRESETS.find((p) => p.label === presetLabel)
    if (!preset) return
    setSelectedPreset(presetLabel)
    setValue("job", preset.job, { shouldValidate: true })
    setValue("instructions", preset.instructions, { shouldValidate: true })

    const currentName = getValues("name")
    if (!currentName || PRESETS.some((p) => p.name === currentName)) {
      setValue("name", preset.name, { shouldValidate: true })
    }
  }

  const onSubmit = async (values: BotFormValues) => {
    try {
      const newBot = await createBot({
        name: values.name.trim(),
        job: values.job.trim(),
        avatar: values.avatar,
        instructions: values.instructions?.trim() || null,
      })

      toast.add({
        title: "Bot created",
        description: `${newBot.name} was successfully created.`,
        type: "success",
      })

      setOpen?.(false)
      const nextAvatar = crypto.randomUUID()
      reset({
        name: PRESETS[0].name,
        job: PRESETS[0].job,
        instructions: PRESETS[0].instructions,
        avatar: nextAvatar,
      })
      setSelectedPreset(PRESETS[0].label)
      onSuccess?.(newBot)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create bot"
      setError("root", { message })
      toast.add({
        title: "Failed to create bot",
        description: message,
        type: "error",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger render={children as React.ReactElement} />
      ) : (
        <DialogTrigger
          render={
            <Button variant="secondary">
              <Plus data-icon="inline-start" />
              Create a new bot
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New bot</DialogTitle>
            <DialogDescription>
              Give it a face, a name, and a job to do.
            </DialogDescription>
          </DialogHeader>

          {/* Preset Buttons */}
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[selectedPreset]}
            onValueChange={(val) => {
              const next = val[0]
              if (next) {
                handleSelectPreset(next)
              }
            }}
            className="flex flex-wrap gap-2 w-full"
          >
            {PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset.label}
                value={preset.label}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-normal border-border/70",
                  selectedPreset === preset.label &&
                    "border-foreground/30 bg-muted/60 text-foreground"
                )}
              >
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Face row */}
          <div className="flex items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-3">
              <ChatAvatar
                seed={avatarSeed}
                width={44}
                height={44}
                className="size-11 shrink-0"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-tight">Face</span>
                <span className="text-xs text-muted-foreground">
                  Shuffle until you find one you like.
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleShuffle}
            >
              <Shuffle data-icon="inline-start" />
              Shuffle
            </Button>
          </div>

          {/* Form fields */}
          <FieldGroup className="gap-3.5">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="bot-name">Name</FieldLabel>
              <Input
                id="bot-name"
                placeholder="Ada"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.job}>
              <FieldLabel htmlFor="bot-job">Job</FieldLabel>
              <Input
                id="bot-job"
                placeholder="Research assistant"
                aria-invalid={!!errors.job}
                {...register("job")}
              />
              {errors.job && <FieldError>{errors.job.message}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.instructions}>
              <FieldLabel htmlFor="bot-instructions">
                How it should work
              </FieldLabel>
              <Textarea
                id="bot-instructions"
                rows={3}
                placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                aria-invalid={!!errors.instructions}
                {...register("instructions")}
              />
              {errors.instructions && (
                <FieldError>{errors.instructions.message}</FieldError>
              )}
            </Field>
          </FieldGroup>

          {errors.root && (
            <p className="text-sm text-destructive">{errors.root.message}</p>
          )}

          <DialogFooter className="mt-2">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Create bot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
