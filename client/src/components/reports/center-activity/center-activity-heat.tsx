import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { markedText } from "@/components/payments/debt-history/marked-text";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { cn } from "@/lib/utils";
import { DAY_FULL, DAY_SHORT, HEAT_CLASS, freeRoomsText, heatDetail, hourLabel, insightSentences } from "./center-activity-format";
import { CenterActivityHeatDetail } from "./center-activity-heat-detail";
import type { CenterOverview, HeatTone, WeekDay } from "./center-activity-types";

const LEGEND: { tone: HeatTone; text: string }[] = [
  { tone: "green", text: msg("Ko'p bo'sh") },
  { tone: "light", text: msg("Yarmi") },
  { tone: "yellow", text: msg("Kam") },
  { tone: "red", text: msg("Deyarli to'la") },
];

/**
 * «Qachon xona bo'sh» (spec B7b §4): free rooms per weekday and hour for ONE branch.
 * The cards and tables around it cover the whole scope, so the branch is named in the heading.
 */
export function CenterActivityHeat({
  data, branches, onBranch,
}: {
  data: NonNullable<CenterOverview["heat"]>;
  branches: CenterOverview["branches"];
  onBranch: (id: number) => void;
}) {
  const t = useT();
  const { heat, insight } = data;
  const [pick, setPick] = useState<{ branchId: number; day: WeekDay; hour: number } | null>(null);
  // A pick from another branch is cleared for good (going back must not revive it); the page remounts this on a new month.
  if (pick && pick.branchId !== data.branchId) setPick(null);
  const detail = pick && pick.branchId === data.branchId ? heatDetail(heat, pick.day, pick.hour, t) : null;
  const isPicked = (day: WeekDay, hour: number) => detail !== null && pick?.day === day && pick.hour === hour;
  const sentences = insightSentences(insight, t);
  const branchName = branches.find((b) => b.id === data.branchId)?.name;
  // Row heads by the day itself (not by position); locals, because the scanner reads `t(variable)`, not `t(MAP[key])`.
  const rows = heat.days.map((day, di) => ({ day, cells: heat.cells[di], short: DAY_SHORT[day], full: DAY_FULL[day] }));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-medium">{t("Qachon xona bo'sh — yangi guruh uchun")}</h3>
            <p className="text-sm text-muted-foreground">
              {branchName ? `${t("{branch} bo'yicha.", { branch: branchName })} ` : ""}
              {t("Katakdagi son — o'sha soatda nechta xona bo'sh ({n} tadan).", { n: heat.rooms })}
            </p>
          </div>
          {branches.length > 1 && (
            <Select value={String(data.branchId)} onValueChange={(v) => onBranch(Number(v))}>
              <SelectTrigger className="w-[200px]" aria-label={t("Filial")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} · {t("{n} xona", { n: b.rooms })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {LEGEND.map((l) => (
            <span key={l.tone} className={cn("rounded px-2 py-0.5", HEAT_CLASS[l.tone])}>
              {t(l.text)}
            </span>
          ))}
        </div>

        {heat.hours.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("Bu filialda xona yo'q")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mx-auto border-separate border-spacing-0.5 text-xs">
              <caption className="sr-only">{t("Haftaning kunlari va soatlar bo'yicha bo'sh xonalar soni")}</caption>
              <thead>
                <tr>
                  <td />
                  {heat.hours.map((h) => (
                    <th key={h} scope="col" className="px-1 font-normal text-muted-foreground">{hourLabel(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ day, cells, short, full }) => (
                  <tr key={day}>
                    <th scope="row" className="pr-2 text-right font-normal text-muted-foreground">{t(short)}</th>
                    {cells.map((c, hi) => (
                      <td key={heat.hours[hi]}>
                        <button
                          type="button"
                          title={`${t(short)} ${hourLabel(heat.hours[hi])}:00 — ${freeRoomsText(c.free, t)}`}
                          aria-label={`${t(full)} ${hourLabel(heat.hours[hi])}:00 — ${freeRoomsText(c.free, t)}`}
                          aria-pressed={isPicked(day, heat.hours[hi])}
                          onClick={() =>
                            setPick(isPicked(day, heat.hours[hi]) ? null : { branchId: data.branchId, day, hour: heat.hours[hi] })
                          }
                          className={cn(
                            "block h-7 w-8 rounded text-center font-semibold",
                            HEAT_CLASS[c.tone],
                            isPicked(day, heat.hours[hi]) && "outline outline-2 outline-offset-2 outline-primary",
                          )}
                        >
                          {c.free}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {heat.hours.length > 0 && <CenterActivityHeatDetail detail={detail} />}

        {(sentences.quiet.length > 0 || sentences.busy) && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {sentences.quiet.length > 0 && (
              <>
                {markedText(t("Eng qulay vaqt: **{times}**.", { times: sentences.quiet.join(` ${t("va")} `) }))}{" "}
              </>
            )}
            {sentences.busy && markedText(t("Eng tig'iz: **{time}**.", { time: sentences.busy }))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
