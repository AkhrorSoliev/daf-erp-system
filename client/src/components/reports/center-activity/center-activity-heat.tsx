import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HEAT_CLASS, hourLabel, insightSentences } from "./center-activity-format";
import type { CenterOverview, HeatTone } from "./center-activity-types";

const DAY_HEAD = ["Du", "Se", "Chor", "Pay", "Ju", "Sha"];
const LEGEND: { tone: HeatTone; text: string }[] = [
  { tone: "green", text: "Ko'p bo'sh" },
  { tone: "light", text: "Yarmi" },
  { tone: "yellow", text: "Kam" },
  { tone: "red", text: "Deyarli to'la" },
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
  const { heat, insight } = data;
  const sentences = insightSentences(insight);
  const branchName = branches.find((b) => b.id === data.branchId)?.name;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-medium">Qachon xona bo&apos;sh — yangi guruh uchun</h3>
            <p className="text-sm text-muted-foreground">
              {branchName ? `${branchName} bo'yicha. ` : ""}
              Katakdagi son — o&apos;sha soatda nechta xona bo&apos;sh ({heat.rooms} tadan).
            </p>
          </div>
          {branches.length > 1 && (
            <Select value={String(data.branchId)} onValueChange={(v) => onBranch(Number(v))}>
              <SelectTrigger className="w-[200px]" aria-label="Filial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} · {b.rooms} xona
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {LEGEND.map((l) => (
            <span key={l.tone} className={cn("rounded px-2 py-0.5", HEAT_CLASS[l.tone])}>
              {l.text}
            </span>
          ))}
        </div>

        {heat.hours.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Bu filialda xona yo&apos;q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mx-auto border-separate border-spacing-0.5 text-xs">
              <caption className="sr-only">Haftaning kunlari va soatlar bo&apos;yicha bo&apos;sh xonalar soni</caption>
              <thead>
                <tr>
                  <td />
                  {heat.hours.map((h) => (
                    <th key={h} scope="col" className="px-1 font-normal text-muted-foreground">{hourLabel(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.days.map((day, di) => (
                  <tr key={day}>
                    <th scope="row" className="pr-2 text-right font-normal text-muted-foreground">{DAY_HEAD[di]}</th>
                    {heat.cells[di].map((c, hi) => (
                      <td
                        key={heat.hours[hi]}
                        title={`${DAY_HEAD[di]} ${hourLabel(heat.hours[hi])}:00 — ${c.free} ta xona bo'sh`}
                        aria-label={`${DAY_HEAD[di]} ${hourLabel(heat.hours[hi])}:00 — ${c.free} ta xona bo'sh`}
                        className={cn("h-7 w-8 rounded text-center font-semibold", HEAT_CLASS[c.tone])}
                      >
                        {c.free}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(sentences.quiet.length > 0 || sentences.busy) && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {sentences.quiet.length > 0 && (
              <>
                Eng qulay vaqt: <b>{sentences.quiet.join(" va ")}</b>.{" "}
              </>
            )}
            {sentences.busy && (
              <>
                Eng tig&apos;iz: <b>{sentences.busy}</b>.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
