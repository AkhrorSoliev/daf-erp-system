"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  BookOpen,
  Theater,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface Conversation {
  id: string;
  chatMode: string | null;
  title: string | null;
  lastMessage: string | null;
  lastMessageRole: string | null;
  createdAt: string;
  updatedAt: string;
}

const modeIcons: Record<string, typeof MessageSquare> = {
  FREE_CONVERSATION: MessageSquare,
  GRAMMAR_PRACTICE: BookOpen,
  ROLEPLAY: Theater,
};

const modeLabels: Record<string, string> = {
  FREE_CONVERSATION: "Suhbat",
  GRAMMAR_PRACTICE: "Grammatika",
  ROLEPLAY: "Rol o'yini",
};

export function AiConversationList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () =>
      api
        .get("/student-portal/ai-chat", { params: { pageSize: 20 } })
        .then((r) => r.data),
  });

  const conversations: Conversation[] = data?.data ?? [];

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await api.delete(`/student-portal/ai-chat/${id}`);
      queryClient.setQueryData(["ai-conversations"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((c: Conversation) => c.id !== id),
          total: old.total - 1,
        };
      });
      toast.success("Suhbat o'chirildi");
    } catch (err) {
      toast.error(
        (err as any)?.response?.data?.message || "O'chirishda xatolik"
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 mb-1" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground px-1">
        O&apos;tgan suhbatlar
      </h3>
      <div className="space-y-1.5">
        {conversations.map((conv) => {
          const Icon = modeIcons[conv.chatMode ?? ""] ?? Sparkles;
          const label = modeLabels[conv.chatMode ?? ""] ?? "Chat";
          const isDeleting = deletingId === conv.id;

          return (
            <button
              key={conv.id}
              onClick={() => router.push(`/portal/ai/chat/${conv.id}`)}
              className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50 active:scale-[0.99]"
            >
              <Icon className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">
                    {conv.title || label}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(conv.updatedAt), {
                      addSuffix: true,
                      locale: uz,
                    })}
                  </span>
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessageRole === "user" ? "Siz: " : ""}
                    {conv.lastMessage.slice(0, 60)}
                  </p>
                )}
              </div>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                disabled={isDeleting}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                {isDeleting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );
}
