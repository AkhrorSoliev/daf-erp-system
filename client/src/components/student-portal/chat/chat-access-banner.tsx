"use client";

import { Card, ProgressBar } from "../lumio";
import { useT } from "@/i18n/context";
import { useChatAccess } from "./chat-queries";
import { accessView, type AccessProgress } from "./chat-access-view";

function Row({
  label,
  have,
  need,
}: {
  label: string;
  have: number;
  need: number;
}) {
  const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink-700">{label}</span>
      <ProgressBar value={pct} height={8} color="var(--amber-500)" />
    </div>
  );
}

function Progress({ p }: { p: AccessProgress }) {
  const t = useT();
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <Row
        label={t("Mashq: {have}/{need} daqiqa", {
          have: p.activeHave,
          need: p.activeNeed,
        })}
        have={p.activeHave}
        need={p.activeNeed}
      />
      <Row
        label={t("Radio: {have}/{need} daqiqa", {
          have: p.radioHave,
          need: p.radioNeed,
        })}
        have={p.radioHave}
        need={p.radioNeed}
      />
    </div>
  );
}

/** What the server says about writing; draws nothing when all is well. */
export function ChatAccessBanner() {
  const { data } = useChatAccess();
  if (!data) return null;
  const view = accessView(data);
  if (view.mode === "open") return null;
  const danger = view.mode === "banned";

  return (
    <Card
      role="status"
      pad="sm"
      className={`mb-3 border ${danger ? "border-danger/40" : "border-amber-500/40"}`}
    >
      {/* Server sentences are data: shown as sent, never through t(). */}
      {view.lines.map((line, i) => (
        <p
          key={i}
          className={`text-sm font-semibold ${danger ? "text-danger" : "text-amber-700"}`}
        >
          {line}
        </p>
      ))}
      {/* Bars only for a QUOTA lock; the server sentence covers the rest. */}
      {view.progress && <Progress p={view.progress} />}
    </Card>
  );
}
