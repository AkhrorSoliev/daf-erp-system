"use client";

import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import type { CommentData } from "./comment-list";

interface CommentFormProps {
  entityType: string;
  entityId: string | number;
  onOptimisticAdd?: (comment: CommentData) => void;
  onConfirmed?: (tempId: string, real: CommentData) => void;
  onFailed?: (tempId: string) => void;
  focusKey?: number;
}

export function CommentForm({
  entityType,
  entityId,
  onOptimisticAdd,
  onConfirmed,
  onFailed,
  focusKey,
}: CommentFormProps) {
  const user = useAuth((s) => s.user);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focusKey && focusKey > 0) {
      setTimeout(() => {
        textareaRef.current?.focus();
        setFocused(true);
      }, 100);
    }
  }, [focusKey]);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;

    const tempId = `temp-${Date.now()}`;
    const trimmedContent = content.trim();

    // Optimistic
    const optimistic: CommentData = {
      id: tempId,
      entityType,
      entityId: String(entityId),
      content: trimmedContent,
      author: {
        id: user?.id ?? 0,
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        photo: user?.photo ?? null,
      },
      createdAt: new Date().toISOString(),
      _pending: true,
    };
    onOptimisticAdd?.(optimistic);

    setContent("");
    setFocused(false);

    setSubmitting(true);
    try {
      const { data } = await api.post("/comments", {
        entityType,
        entityId: String(entityId),
        content: trimmedContent,
      });
      onConfirmed?.(tempId, data);
    } catch (err) {
      onFailed?.(tempId);
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isExpanded = focused || content.trim().length > 0;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="p-3">
        <Textarea
          ref={textareaRef}
          placeholder="Izoh yozing..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          rows={isExpanded ? 3 : 1}
          className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60 p-2"
        />
      </div>

      {isExpanded && (
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">
            Ctrl+Enter
          </span>
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
          >
            <Send className="mr-1 size-3" />
            {submitting ? "..." : "Yuborish"}
          </Button>
        </div>
      )}
    </div>
  );
}
