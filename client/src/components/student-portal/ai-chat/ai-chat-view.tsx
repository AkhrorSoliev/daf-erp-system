"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  MessageSquare,
  BookOpen,
  Theater,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAiStream } from "@/hooks/use-ai-stream";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMessageBubble } from "./ai-message-bubble";
import { AiQuickActions } from "./ai-quick-actions";
import { AiChatInput } from "./ai-chat-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const modeIcons: Record<string, typeof MessageSquare> = {
  FREE_CONVERSATION: MessageSquare,
  GRAMMAR_PRACTICE: BookOpen,
  ROLEPLAY: Theater,
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
      toast.error(
        (err as any)?.response?.data?.message || "O'chirishda xatolik"
      );
      setDeleting(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => abort();
  }, [abort]);

  const chatMode = data?.chatMode ?? "";
  const Icon = modeIcons[chatMode] ?? Sparkles;
  const modeLabel = modeLabels[chatMode] ?? "Deutsch Chat";
  const title = data?.title || modeLabel;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-4 border-b">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex-1 p-4 space-y-4">
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
    <div className="flex flex-col h-[calc(100dvh-(--spacing(12))-(--spacing(20)))] md:h-[calc(100dvh-(--spacing(14)))] max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
        <button
          onClick={() => router.push("/portal/ai")}
          className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-medium truncate flex-1">{title}</h2>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
            <Icon className="size-10 opacity-30" />
            <p className="text-sm">
              {chatMode === "GRAMMAR_PRACTICE"
                ? "Grammatika bo'yicha savol yozing!"
                : chatMode === "ROLEPLAY"
                  ? "Rol o'yinini boshlang!"
                  : "Nemischa suhbatni boshlang!"}
            </p>
            <p className="text-xs opacity-60">
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

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <AiMessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming
          />
        )}

        {/* Streaming loader (before first chunk) */}
        {isStreaming && !streamingContent && (
          <div className="flex gap-2 justify-start">
            <div className="shrink-0 size-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-md bg-muted/60 border px-4 py-3">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" />
                <span
                  className="size-1.5 rounded-full bg-foreground/40 animate-bounce"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="size-1.5 rounded-full bg-foreground/40 animate-bounce"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions + Input */}
      <div className="shrink-0 px-4 pb-4 pt-2 space-y-2 border-t bg-background">
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
