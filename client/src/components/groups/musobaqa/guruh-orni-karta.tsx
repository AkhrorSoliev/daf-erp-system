"use client";

import { Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiCard } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { haftaYorligi, kartaIzohi } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

export function GuruhOrniKarta({
  data,
  onHafta,
}: {
  data: MusobaqaJavob;
  /** `null` — joriy hafta. */
  onHafta: (hafta: string | null) => void;
}) {
  const t = useT();
  const g = data.guruh;
  const izoh = kartaIzohi(g, t) ?? "";
  const azolarIzohi = t("{n} a'zo, jami {ball} ball", { n: g.azolar, ball: g.ball });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          icon={Trophy}
          label={t("Markazdagi o'rin")}
          value={g.orin !== null && g.guruhSoni !== null ? `${g.orin} / ${g.guruhSoni}` : "—"}
          hint={izoh}
          tooltip={izoh || t("Markazdagi o'rin")}
        />
        <KpiCard
          icon={Users}
          label={t("O'rtacha ball")}
          value={g.baho !== null ? String(g.baho) : "—"}
          hint={azolarIzohi}
          tooltip={azolarIzohi}
        />
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs">{t("Oxirgi haftalar (o'rin)")}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onHafta(null)}
            aria-pressed={data.joriy}
            className={cn(
              "min-h-11 min-w-20 shrink-0 rounded-md border px-3 py-1 text-center text-sm font-medium",
              data.joriy ? "border-primary bg-primary/10" : "hover:bg-muted",
            )}
          >
            {t("joriy")}
          </button>
          {data.tarix.map((q) => {
            const tanlangan = q.haftaBoshi === data.haftaBoshi;
            return (
              <button
                key={q.haftaBoshi}
                type="button"
                onClick={() => onHafta(q.haftaBoshi)}
                aria-pressed={tanlangan}
                aria-label={
                  q.orin !== null
                    ? t("{hafta} haftasi, o'rin {orin}", { hafta: haftaYorligi(q.haftaBoshi), orin: q.orin })
                    : t("{hafta} haftasi, o'rin yo'q", { hafta: haftaYorligi(q.haftaBoshi) })
                }
                className={cn(
                  "min-h-11 min-w-20 shrink-0 rounded-md border px-3 py-1 text-center text-sm",
                  tanlangan ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="text-muted-foreground block text-xs">{haftaYorligi(q.haftaBoshi).split(" ")[0]}</span>
                <span className="font-medium">{q.orin !== null ? q.orin : "—"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
