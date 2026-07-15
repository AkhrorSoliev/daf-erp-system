"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChatCircleDots,
  BookOpen,
  MaskHappy,
  CircleNotch,
  type Icon,
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";

interface ChatMode {
  mode: string;
  title: string;
  subtitle: string;
  icon: Icon;
  grad: string;
}

const chatModes: ChatMode[] = [
  {
    mode: "FREE_CONVERSATION",
    title: "Erkin suhbat",
    subtitle: "Freie Konversation",
    icon: ChatCircleDots,
    grad: "grad-cool clay-sky",
  },
  {
    mode: "GRAMMAR_PRACTICE",
    title: "Grammatika",
    subtitle: "Grammatikübung",
    icon: BookOpen,
    grad: "grad-teal clay-teal",
  },
  {
    mode: "ROLEPLAY",
    title: "Rol o'yini",
    subtitle: "Rollenspiel",
    icon: MaskHappy,
    grad: "grad-grape clay-grape",
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
      toast.error(getErrorMessage(err, "Suhbat yaratishda xatolik"));
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="px-1 font-display text-base font-bold text-ink-900">
        Yangi suhbat boshlash
      </h3>
      <div className="grid grid-cols-3 gap-2.5">
        {chatModes.map((item) => {
          const Ico = item.icon;
          const isLoading = loading === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => handleSelectMode(item.mode)}
              disabled={loading !== null}
              className={cn(
                "clay-btn flex flex-col items-center gap-1.5 rounded-card p-3.5 text-center text-white disabled:opacity-70",
                item.grad,
              )}
            >
              {isLoading ? (
                <CircleNotch size={22} weight="bold" className="animate-spin" />
              ) : (
                <Ico size={24} weight="fill" />
              )}
              <span className="font-display text-xs font-extrabold leading-tight">
                {item.title}
              </span>
              <span className="text-[10px] font-semibold leading-tight text-white/80">
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
