"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChatCircleDots,
  BookOpen,
  MaskHappy,
  Trash,
  CircleNotch,
  Sparkle,
  type Icon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { IconTile, LoadingCards } from "../lumio";
import type { LumioTone } from "../lumio";

interface Conversation {
  id: string;
  chatMode: string | null;
  title: string | null;
  lastMessage: string | null;
  lastMessageRole: string | null;
  createdAt: string;
  updatedAt: string;
}

const MODE: Record<string, { icon: Icon; label: string; tone: LumioTone }> = {
  FREE_CONVERSATION: { icon: ChatCircleDots, label: "Suhbat", tone: "sky" },
  GRAMMAR_PRACTICE: { icon: BookOpen, label: "Grammatika", tone: "teal" },
  ROLEPLAY: { icon: MaskHappy, label: "Rol o'yini", tone: "grape" },
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
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return <LoadingCards count={3} />;
  }

  if (conversations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="px-1 font-display text-base font-bold text-ink-900">
        O&apos;tgan suhbatlar
      </h3>
      <div className="space-y-2">
        {conversations.map((conv) => {
          const cfg = MODE[conv.chatMode ?? ""];
          const Ico = cfg?.icon ?? Sparkle;
          const label = cfg?.label ?? "Chat";
          const isDeleting = deletingId === conv.id;

          return (
            <div
              key={conv.id}
              className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-lumio-sm transition-colors hover:bg-tint"
            >
              <button
                onClick={() => router.push(`/portal/ai/chat/${conv.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <IconTile icon={<Ico weight="bold" />} tone={cfg?.tone ?? "grape"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-ink-900">
                      {conv.title || label}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-ink-400">
                      {formatDistanceToNow(new Date(conv.updatedAt), {
                        addSuffix: true,
                        locale: uz,
                      })}
                    </span>
                  </span>
                  {conv.lastMessage ? (
                    <span className="mt-0.5 block truncate text-xs font-semibold text-ink-500">
                      {conv.lastMessageRole === "user" ? "Siz: " : ""}
                      {conv.lastMessage.slice(0, 60)}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                disabled={isDeleting}
                aria-label="Suhbatni o'chirish"
                className="shrink-0 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                {isDeleting ? (
                  <CircleNotch size={16} weight="bold" className="animate-spin" />
                ) : (
                  <Trash size={16} weight="bold" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
