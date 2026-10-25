"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2 } from "lucide-react"

import {
  createGroupChat,
  deleteGroupChat,
  updateGroupChat,
} from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

export interface GroupChatDialogChat {
  id: string
  name?: string | null
  botIds?: string[]
  bots?: Array<{ id: string; name: string; avatar?: string | null; job?: string | null }>
}

export interface GroupChatDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  onSuccess?: (chat: Chat) => void
  onDelete?: (chat: Chat) => void
  chat?: GroupChatDialogChat | null
  mode?: "create" | "edit"
}

export function GroupChatDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  onSuccess,
  onDelete,
  chat,
  mode,
}: GroupChatDialogProps) {
  const isEdit = mode === "edit" || (mode !== "create" && Boolean(chat?.id))
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = isControlled ? controlledOnOpenChange : setUncontrolledOpen

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [availableBots, setAvailableBots] = React.useState<Bot[]>([])
  const [isLoadingBots, setIsLoadingBots] = React.useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GroupChatFormValues>({
    resolver: zodResolver(groupChatFormSchema),
    defaultValues: {
      name: chat?.name ?? "",
      botIds: chat?.botIds ?? [],
    },
  })

  const selectedBotIds = useWatch({
    control,
    name: "botIds",
  }) ?? []

  const selectedBots = React.useMemo(() => {
    return availableBots.filter((bot) => selectedBotIds.includes(bot.id))
  }, [availableBots, selectedBotIds])

  React.useEffect(() => {
    if (open) {
      if (isEdit && chat) {
        reset({
          name: chat.name ?? "",
          botIds: chat.botIds ?? [],
        })
      } else if (!isEdit) {
        reset({
          name: "",
          botIds: [],
        })
      }
      setIsLoadingBots(true)
      getUserBots()
        .then((bots) => {
          if (chat?.bots && chat.bots.length > 0) {
            const existingIds = new Set(bots.map((b) => b.id))
            const missing = chat.bots
              .filter((b) => !existingIds.has(b.id))
              .map((b) => ({
                id: b.id,
                name: b.name,
                avatar: b.avatar ?? "",
                job: b.job ?? "",
                instructions: null,
                sandboxId: null,
                userId: "",
                createdAt: new Date(),
              })) as Bot[]
            setAvailableBots([...bots, ...missing])
          } else {
            setAvailableBots(bots)
          }
        })
        .catch(() => {
          setAvailableBots(
            (chat?.bots?.map((b) => ({
              id: b.id,
              name: b.name,
              avatar: b.avatar ?? "",
              job: b.job ?? "",
              instructions: null,
              sandboxId: null,
              userId: "",
              createdAt: new Date(),
            })) as Bot[]) ?? []
          )
        })
        .finally(() => {
          setIsLoadingBots(false)
        })
    }
  }, [open, isEdit, chat, reset])

  const onSubmit = async (values: GroupChatFormValues) => {
    try {
      if (isEdit && chat?.id) {
        const updatedChat = await updateGroupChat({
          id: chat.id,
          name: values.name.trim(),
          botIds: values.botIds,
        })
        toast.add({
          title: "Group chat updated",
          description: `"${updatedChat.name}" was successfully updated.`,
          type: "success",
        })
        setOpen?.(false)
        onSuccess?.(updatedChat)
      } else {
        const newChat = await createGroupChat({
          name: values.name.trim(),
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
        reset({
          name: "",
          botIds: [],
        })
        onSuccess?.(newChat)
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : isEdit
            ? "Failed to update group chat"
            : "Failed to create group chat"
      setError("root", { message })
      toast.add({
        title: isEdit ? "Failed to update group chat" : "Failed to create group chat",
        description: message,
        type: "error",
      })
    }
  }

  const handleDelete = async () => {
    if (!chat?.id) return
    setIsDeleting(true)
    try {
      const deletedChat = await deleteGroupChat(chat.id)
      toast.add({
        title: "Group chat deleted",
        description: `${deletedChat.name || "Group chat"} was successfully deleted.`,
        type: "success",
      })
      setShowDeleteConfirm(false)
      setOpen?.(false)
      onDelete?.(deletedChat)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete group chat"
      toast.add({
        title: "Failed to delete group chat",
        description: message,
        type: "error",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {children ? (
          <DialogTrigger render={children as React.ReactElement} />
        ) : !isControlled ? (
          <DialogTrigger
            render={
              <Button variant={isEdit ? "outline" : "secondary"}>
                {!isEdit && <Plus data-icon="inline-start" />}
                {isEdit ? "Edit group chat" : "Create group chat"}
              </Button>
            }
          />
        ) : null}
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Edit group chat" : "New group chat"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Update group name, add or remove members, or delete this group chat."
                  : "Name the group and pick which bots are in it."}
              </DialogDescription>
            </DialogHeader>

            {/* Group Avatar preview */}
            <div className="flex items-center gap-3 py-1">
              <GroupChatAvatar
                bots={selectedBots}
                alt="Group avatar"
                className="size-11 shrink-0"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-tight">Group Icon</span>
                <span className="text-xs text-muted-foreground">
                  {selectedBotIds.length} member{selectedBotIds.length === 1 ? "" : "s"} selected
                </span>
              </div>
            </div>

            <FieldGroup className="gap-3.5">
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
                <FieldLabel>Members</FieldLabel>
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
                              const currentIds = getValues("botIds") || []
                              if (checked) {
                                setValue("botIds", [...currentIds, bot.id], {
                                  shouldValidate: true,
                                })
                              } else {
                                setValue(
                                  "botIds",
                                  currentIds.filter((id) => id !== bot.id),
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
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-sm font-medium leading-none">
                              {bot.name}
                            </span>
                            {bot.job && (
                              <span className="truncate text-xs text-muted-foreground mt-0.5">
                                {bot.job}
                              </span>
                            )}
                          </div>
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

            {errors.root && (
              <p className="text-sm text-destructive">{errors.root.message}</p>
            )}

            <DialogFooter className="mt-2">
              {isEdit && chat?.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitting || isDeleting}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="sm:mr-auto"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete group chat
                </Button>
              ) : null}
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isDeleting}
                  />
                }
              >
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={isSubmitting || isDeleting || availableBots.length === 0}
              >
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isEdit ? "Save changes" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isEdit && chat?.id ? (
        <AlertDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {chat.name || "group chat"}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this group chat and its conversation. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting && <Spinner data-icon="inline-start" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

export function EditGroupChatDialog(props: GroupChatDialogProps) {
  return <GroupChatDialog mode="edit" {...props} />
}

export default GroupChatDialog
