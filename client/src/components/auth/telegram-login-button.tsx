"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

// Telegram'ning rasmiy OAuth oqimi. Tugma faqat backend funksiya yoniq deb
// aytganda ko'rinadi — sozlama Railway env'ida bo'lmasa hech narsa chizilmaydi.
export function TelegramLoginButton({
  variant = "default",
}: {
  variant?: "default" | "lumio";
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/auth/telegram/status")
      .then((res) => {
        if (active) setEnabled(Boolean(res.data?.enabled));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  async function start() {
    setError("");
    setLoading(true);
    try {
      const res = await api.get("/auth/telegram/start");
      window.location.href = res.data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Telegram orqali kirishni boshlab bo'lmadi"));
      setLoading(false);
    }
  }

  const isLumio = variant === "lumio";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={isLumio ? "h-px flex-1 bg-line" : "h-px flex-1 bg-border"} />
        <span
          className={
            isLumio
              ? "text-sm font-semibold text-ink-500"
              : "text-sm text-muted-foreground"
          }
        >
          yoki
        </span>
        <div className={isLumio ? "h-px flex-1 bg-line" : "h-px flex-1 bg-border"} />
      </div>

      {error ? (
        <div
          className={
            isLumio
              ? "rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"
              : "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={
          isLumio
            ? "flex h-[54px] w-full items-center justify-center rounded-md border border-line-strong bg-surface text-base font-bold text-ink-900 disabled:opacity-50"
            : "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        }
      >
        {loading ? "Telegram ochilmoqda..." : "Telegram orqali kirish"}
      </button>
    </div>
  );
}
