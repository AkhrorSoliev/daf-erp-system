"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { faollikniBoshla } from "../lib/activity-runtime";

/**
 * Qobiqdagi boshsiz komponent (dizayn 4.5) — `RadioHost` kabi portal qobig'ida
 * bir marta chiziladi, shuning uchun sahifalar orasida o'tganda hisob uzilmaydi.
 * Foydalanuvchi o'zgarsa yoki qobiq yopilsa, joriy seans yopiladi.
 */
export function ActivityHost() {
  const userId = useAuth((s) => s.user?.id ?? null);

  useEffect(() => {
    if (userId === null) return;
    return faollikniBoshla(userId);
  }, [userId]);

  return null;
}
