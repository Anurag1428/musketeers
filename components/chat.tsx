"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Spinner } from "@/components/ui/spinner"
import {
  mintChatAccessToken,
  startChatSession,
  loadTranscript,
} from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"

interface ChatProps {
  chatId: string
  botName?: string
  instructions?: string
}

export function Chat({ chatId, botName }: ChatProps) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })

  const { messages: initialMessages, isLoading } = useLoadTranscript(
    chatId,
    loadTranscript,
    { transport }
  )

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <ChatContent
      key={chatId}
      chatId={chatId}
      botName={botName}
      transport={transport}
      initialMessages={initialMessages}
    />
  )
}

function ChatContent({
  chatId,
  botName,
  transport,
  initialMessages,
}: {
  chatId: string
  botName?: string
  transport: ReturnType<typeof useTriggerChatTransport<typeof chatAgent>>
  initialMessages: UIMessage[]
}) {
  const [input, setInput] = React.useState("")
  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    transport,
    messages: initialMessages,
    resume: initialMessages.length > 0,
  })

  const isGenerating = status === "submitted" || status === "streaming"

  const handleStop = React.useCallback(() => {
    stop()
    transport.stopGeneration(chatId)
  }, [stop, transport, chatId])

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim() || input.trim()
    if (!text) return

    sendMessage({ text })
    setInput("")
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title={botName ? `Chat with ${botName}` : "Start a conversation"}
              description="Type a message below to begin chatting."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts?.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${message.id}-${i}`}>
                          {part.text}
                        </MessageResponse>
                      )
                    }
                    return null
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              placeholder={botName ? `Message ${botName}...` : "Ask anything..."}
              onChange={(e) => setInput(e.target.value)}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              disabled={!input.trim() && !isGenerating}
              status={status}
              onStop={handleStop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export const ChatView = Chat
