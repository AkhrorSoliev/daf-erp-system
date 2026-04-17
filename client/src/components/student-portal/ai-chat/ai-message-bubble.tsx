"use client";

import { Sparkles, User } from "lucide-react";

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
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 size-7 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <Sparkles className="size-3.5 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted/60 border rounded-bl-md"
        }`}
      >
        <MessageContent content={content} isUser={isUser} />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
      {isUser && (
        <div className="shrink-0 size-7 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <User className="size-3.5 text-primary" />
        </div>
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

  // Parse assistant content for correction markers and formatting
  const lines = content.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Correction line
        if (line.startsWith("✏️")) {
          return (
            <div
              key={i}
              className="bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2.5 py-1.5 text-xs"
            >
              {line}
            </div>
          );
        }

        // Empty line
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
