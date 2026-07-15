"use client";

import { Sparkle, User } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface AiMessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function AiMessageBubble({
  role,
  content,
  isStreaming,
}: AiMessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-coral-500/12 text-coral-600">
          <Sparkle size={15} weight="fill" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 text-sm font-semibold leading-relaxed",
          isUser
            ? "rounded-2xl rounded-br-md bg-coral-500 text-white"
            : "rounded-2xl rounded-bl-md border border-line bg-tint text-ink-800",
        )}
      >
        <MessageContent content={content} isUser={isUser} />
        {isStreaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current align-text-bottom opacity-60" />
        )}
      </div>
      {isUser && (
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-coral-500/12 text-coral-600">
          <User size={15} weight="fill" />
        </span>
      )}
    </div>
  );
}

function MessageContent({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  const lines = content.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Correction line
        if (line.startsWith("✏️")) {
          return (
            <div
              key={i}
              className="rounded-md border border-amber-500/25 bg-amber-500/12 px-2.5 py-1.5 text-xs text-amber-600"
            >
              {line}
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {line}
          </p>
        );
      })}
    </div>
  );
}
