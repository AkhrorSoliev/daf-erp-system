"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { KpiSignal } from "./kpi-types";

/** «Diqqat» (spec §7.9): the server's signals, numbers included; a click opens the person. */
export function KpiAttention({ signals, onOpen }: { signals: KpiSignal[]; onOpen: (userId: number) => void }) {
  const t = useT();
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{t("Diqqat")}</h3>
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Bu oyda e'tibor talab qiladigan holat yo'q")}</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s, i) => (
            <li key={`${s.kind}-${s.userId}-${i}`}>
              <button
                type="button"
                onClick={() => onOpen(s.userId)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border border-l-4 p-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.tone === "bad" ? "border-l-destructive" : "border-l-green-600",
                )}
              >
                {s.tone === "bad" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : (
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-green-600" />
                )}
                <span>{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
