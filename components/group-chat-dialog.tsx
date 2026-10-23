"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createGroupChat } from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { toast } from "@/components/ui/toast"
import type { Bot, Chat } from "@/lib/db/schema"
import { getUserBots } from "@/queries/bot"

const groupChatFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  botIds: z.array(z.string()).min(1, "Select at least one bot"),
})

export type GroupChatFormValues = z.infer<typeof groupChatFormSchema>

export interface GroupChatDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  onSuccess?: (chat: Chat) => void
}

export function GroupChatDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  onSuccess,
}: GroupChatDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = isControlled ? controlledOnOpenChange : setUncontrolledOpen

  const [availableBots, setAvailableBots] = React.useState<Bot[]>([])
  const [isLoadingBots, setIsLoadingBots] = React.useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GroupChatFormValues>({
    resolver: zodResolver(groupChatFormSchema),
    defaultValues: {
      name: "",
      botIds: [],
    },
  })

  const selectedBotIds = useWatch({
    control,
    name: "botIds",
  }) ?? []

  React.useEffect(() => {
    if (open) {
      reset({
        name: "",
        botIds: [],
      })
      setIsLoadingBots(true)
      getUserBots()
        .then((bots) => {
          setAvailableBots(bots)
        })
        .catch(() => {
          setAvailableBots([])
        })
        .finally(() => {
          setIsLoadingBots(false)
        })
    }
  }, [open, reset])

  const onSubmit = async (values: GroupChatFormValues) => {
    try {
      const newChat = await createGroupChat({
        name: values.name,
        botIds: values.botIds,
      })
      toast.add({
        title: "Group chat created",
        description: `Created "${values.name}" with ${values.botIds.length} bot${
          values.botIds.length === 1 ? "" : "s"
        }`,
        type: "success",
      })
      setOpen?.(false)
      reset()
      onSuccess?.(newChat)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create group chat"
      toast.add({
        title: "Failed to create group chat",
        description: message,
        type: "error",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger render={children as React.ReactElement} />
      ) : null}
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Name the group and pick which bots are in it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input
                id="group-name"
                placeholder="Weekend plans"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.botIds}>
              <FieldLabel>Bots</FieldLabel>
              {isLoadingBots ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="size-5 text-muted-foreground" />
                </div>
              ) : availableBots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No bots available. Create a bot first before creating a group chat.
                </p>
              ) : (
                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                  {availableBots.map((bot) => {
                    const isChecked = selectedBotIds.includes(bot.id)
                    return (
                      <label
                        key={bot.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none transition-colors"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setValue("botIds", [...selectedBotIds, bot.id], {
                                shouldValidate: true,
                              })
                            } else {
                              setValue(
                                "botIds",
                                selectedBotIds.filter((id) => id !== bot.id),
                                { shouldValidate: true }
                              )
                            }
                          }}
                        />
                        <ChatAvatar
                          seed={bot.avatar || bot.name}
                          alt={bot.name}
                          className="size-6 shrink-0"
                        />
                        <span className="text-sm font-medium">{bot.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {errors.botIds && (
                <FieldError>{errors.botIds.message}</FieldError>
              )}
            </Field>
          </FieldGroup>

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
            <Button
              type="submit"
              disabled={isSubmitting || availableBots.length === 0}
            >
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default GroupChatDialog
