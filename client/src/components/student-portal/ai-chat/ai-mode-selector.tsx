"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, BookOpen, Theater, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { LucideIcon } from "lucide-react";

interface ChatMode {
  mode: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  gradient: string;
}

const chatModes: ChatMode[] = [
  {
    mode: "FREE_CONVERSATION",
    title: "Erkin suhbat",
    subtitle: "Freie Konversation",
    icon: MessageSquare,
    gradient: "from-blue-500/10 to-cyan-500/10",
  },
  {
    mode: "GRAMMAR_PRACTICE",
    title: "Grammatika mashq",
    subtitle: "Grammatikübung",
    icon: BookOpen,
    gradient: "from-emerald-500/10 to-green-500/10",
  },
  {
    mode: "ROLEPLAY",
    title: "Rol o'yini",
    subtitle: "Rollenspiel",
    icon: Theater,
    gradient: "from-purple-500/10 to-pink-500/10",
  },
];

export function AiModeSelector() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelectMode(mode: string) {
    setLoading(mode);
    try {
      const res = await api.post("/student-portal/ai-chat", { mode });
      router.push(`/portal/ai/chat/${res.data.id}`);
    } catch (err) {
      toast.error(
        (err as any)?.response?.data?.message || "Suhbat yaratishda xatolik"
      );
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground px-1">
        Yangi suhbat boshlash
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {chatModes.map((item) => {
          const Icon = item.icon;
          const isLoading = loading === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => handleSelectMode(item.mode)}
              disabled={loading !== null}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border bg-linear-to-br ${item.gradient} p-3 transition-all hover:shadow-md active:scale-[0.97] disabled:opacity-60`}
            >
              {isLoading ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <Icon className="size-5 text-foreground/80" />
              )}
              <span className="text-xs font-medium leading-tight text-center">
                {item.title}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
