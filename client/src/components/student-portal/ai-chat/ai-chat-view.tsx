"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CaretLeft,
  Trash,
  CircleNotch,
  ChatCircleDots,
  BookOpen,
  MaskHappy,
  Sparkle,
  type Icon,
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAiStream } from "@/hooks/use-ai-stream";
import { Skeleton } from "../lumio";
import { AiMessageBubble } from "./ai-message-bubble";
import { AiQuickActions } from "./ai-quick-actions";
import { AiChatInput } from "./ai-chat-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const modeIcons: Record<string, Icon> = {
  FREE_CONVERSATION: ChatCircleDots,
  GRAMMAR_PRACTICE: BookOpen,
  ROLEPLAY: MaskHappy,
};

const modeLabels: Record<string, string> = {
  FREE_CONVERSATION: "Erkin suhbat",
  GRAMMAR_PRACTICE: "Grammatika mashq",
  ROLEPLAY: "Rol o'yini",
};

interface AiChatViewProps {
  conversationId: string;
}

export function AiChatView({ conversationId }: AiChatViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sendMessage, abort } = useAiStream();

  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef("");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-conversation", conversationId],
    queryFn: () =>
      api
        .get(`/student-portal/ai-chat/${conversationId}`)
        .then((r) => r.data),
  });

  // Combine server messages with locally added messages (optimistic)
  const serverMessages: Message[] = data?.messages ?? [];
  const messages = [
    ...serverMessages,
    ...localMessages.filter(
      (lm) => !serverMessages.some((sm: Message) => sm.id === lm.id)
    ),
  ];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(
    (content: string) => {
      if (isStreaming) return;

      // Optimistic: add user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, tempUserMsg]);
      setStreamingContent("");
      setIsStreaming(true);
      setSuggestions([]);

      streamingContentRef.current = "";

      sendMessage(conversationId, content, {
        onChunk(chunk) {
          streamingContentRef.current += chunk;
          setStreamingContent(streamingContentRef.current);
        },
        onDone(messageId, newSuggestions) {
          const finalContent = streamingContentRef.current;
          setLocalMessages((prev) => [
            ...prev,
            {
              id: messageId,
              role: "assistant",
              content: finalContent,
              createdAt: new Date().toISOString(),
            },
          ]);
          setStreamingContent("");
          streamingContentRef.current = "";
          setIsStreaming(false);
          setSuggestions(newSuggestions);
          queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
        },
        onError(message) {
          toast.error(message);
          setIsStreaming(false);
          setStreamingContent("");
        },
      });
    },
    [conversationId, isStreaming, sendMessage, queryClient]
  );

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/student-portal/ai-chat/${conversationId}`);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      toast.success("Suhbat o'chirildi");
      router.push("/portal/ai");
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
      setDeleting(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => abort();
  }, [abort]);

  const chatMode = data?.chatMode ?? "";
  const Ico = modeIcons[chatMode] ?? Sparkle;
  const modeLabel = modeLabels[chatMode] ?? "Deutsch Chat";
  const title = data?.title || modeLabel;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-13rem)] flex-col lg:h-[calc(100dvh-6rem)]">
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex-1 space-y-4 pt-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
            >
              <Skeleton
                className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-2/3" : "w-3/4"}`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col lg:h-[calc(100dvh-6rem)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line pb-3">
        <button
          onClick={() => router.push("/portal/ai")}
          aria-label="Orqaga"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-tint"
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-coral-500/12 text-coral-600">
          <Ico size={18} weight="fill" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold text-ink-900">
          {title}
        </h2>
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Suhbatni o'chirish"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          {deleting ? (
            <CircleNotch size={18} weight="bold" className="animate-spin" />
          ) : (
            <Trash size={18} weight="bold" />
          )}
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-3 overflow-y-auto py-4"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-400">
            <Ico size={40} weight="fill" className="opacity-40" />
            <p className="text-sm font-bold text-ink-700">
              {chatMode === "GRAMMAR_PRACTICE"
                ? "Grammatika bo'yicha savol yozing!"
                : chatMode === "ROLEPLAY"
                  ? "Rol o'yinini boshlang!"
                  : "Nemischa suhbatni boshlang!"}
            </p>
            <p className="text-xs font-semibold opacity-70">
              Deutsch schreiben, um zu beginnen
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <AiMessageBubble
            key={msg.id}
            role={msg.role as "user" | "assistant"}
            content={msg.content}
          />
        ))}

        {isStreaming && streamingContent && (
          <AiMessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming
          />
        )}

        {isStreaming && !streamingContent && (
          <div className="flex justify-start gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-coral-500/12 text-coral-600">
              <Sparkle size={15} weight="fill" />
            </span>
            <div className="rounded-2xl rounded-bl-md border border-line bg-tint px-4 py-3">
              <div className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-coral-500/60" />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-coral-500/60"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-coral-500/60"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions + Input */}
      <div className="shrink-0 space-y-2 border-t border-line bg-background pt-2">
        {messages.length > 0 && (
          <AiQuickActions
            suggestions={suggestions}
            onAction={handleSend}
            disabled={isStreaming}
          />
        )}
        <AiChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
