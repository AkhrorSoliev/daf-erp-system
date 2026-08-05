"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonthPicker } from "@/components/ui/month-picker";
import { formatPrice } from "@/lib/format-utils";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

type EventKind = "joined" | "left" | "groupStopped" | "holiday";

interface DayEvent {
  kind: EventKind;
  count: number;
}

interface HistoryPoint {
  date: string;
  day: number;
  expectedValue: number | null;
  lessonsHeldValue: number | null;
  collectedForMonth: number | null;
  collectionPct: number | null;
  delta: number | null;
  events: DayEvent[];
}

interface HistoryResponse {
  month: string;
  branchId: number | null;
  points: HistoryPoint[];
}

const LINE = "#f59e0b";

const EVENT_LABEL: Record<EventKind, (n: number) => string> = {
  joined: (n) => `${n} o'quvchi qo'shildi`,
  left: (n) => `${n} o'quvchi ketdi`,
  groupStopped: (n) => (n === 1 ? "guruh to'xtatildi" : `${n} guruh to'xtatildi`),
  holiday: (n) => (n === 1 ? "bayram qo'shildi" : `${n} bayram qo'shildi`),
};

const MONTHS_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_UZ[(m ?? 1) - 1]} ${y}`;
}

function compact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function eventText(events: DayEvent[]) {
  return events.map((e) => EVENT_LABEL[e.kind](e.count)).join(" · ");
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: HistoryPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.expectedValue == null) return null;

  return (
    <div className="max-w-64 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs font-semibold">{p.day}-kun</p>
      <p className="mt-1 text-base font-bold tabular-nums">
        {formatPrice(p.expectedValue)} so&apos;m
      </p>
      {p.delta != null && p.delta !== 0 && (
        <p
          className={`text-xs font-medium tabular-nums ${
            p.delta < 0
              ? "text-red-600 dark:text-red-400"
              : "text-green-600 dark:text-green-400"
          }`}
        >
          {p.delta > 0 ? "+" : ""}
          {formatPrice(p.delta)} — kechagidan
        </p>
      )}
      {p.events.length > 0 && (
        <p className="mt-1.5 border-t pt-1.5 text-xs text-muted-foreground">
          {eventText(p.events)}
        </p>
      )}
      {(p.lessonsHeldValue != null || p.collectedForMonth != null) && (
        <div className="mt-1.5 space-y-0.5 border-t pt-1.5 text-xs text-muted-foreground">
          {p.lessonsHeldValue != null && (
            <p>O&apos;tilgan: {formatPrice(p.lessonsHeldValue)}</p>
          )}
          {p.collectedForMonth != null && (
            <p>
              Yig&apos;ilgan: {formatPrice(p.collectedForMonth)}
              {p.collectionPct != null ? ` (${p.collectionPct}%)` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Month the overview is showing, "YYYY-MM". */
  month: string;
}

export function ExpectationHistoryDialog({ open, onOpenChange, month }: Props) {
  const { selectedBranch } = useBranchSwitcher();
  const [selected, setSelected] = useState(month);
  const maxMonth = new Date().toISOString().slice(0, 7);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["expectation-history", selectedBranch?.id, selected],
    queryFn: () =>
      api
        .get<HistoryResponse>("/reports/expectation-history", {
          params: { branchId: selectedBranch?.id, month: selected },
        })
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const points = data?.points ?? [];
  const withValue = points.filter((p) => p.expectedValue != null);
  const first = withValue[0];
  const last = withValue[withValue.length - 1];
  const drift =
    first?.expectedValue != null && last?.expectedValue != null
      ? last.expectedValue - first.expectedValue
      : null;

  // Only steps big enough to be worth explaining get a marker. 0.3% of the
  // figure keeps a routine one-student change from littering the line.
  const threshold = last?.expectedValue ? last.expectedValue * 0.003 : 0;
  const notable = points.filter(
    (p) =>
      p.expectedValue != null &&
      p.delta != null &&
      Math.abs(p.delta) >= threshold &&
      p.events.length > 0,
  );

  // Non-zero axis: this line moves a few percent, and a 0-based scale flattens
  // it into a straight edge — hiding the only thing the chart exists to show.
  const values = withValue.map((p) => p.expectedValue as number);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const pad = Math.max((max - min) * 0.25, max * 0.005, 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-3 border-b px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2">
                <CalendarRange className="size-4 text-amber-500" />
                Oy oxiriga kutilyapti — kunlik siljish
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Har kecha yozilgan surat. Qayta hisoblanmaydi — o&apos;sha kuni
                tizim nima ko&apos;rgan bo&apos;lsa, o&apos;sha.
              </p>
            </div>
            <MonthPicker
              value={selected}
              onChange={setSelected}
              maxMonth={maxMonth}
              className="w-[170px] shrink-0"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex h-72 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">
                Tarixni yuklab bo&apos;lmadi
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Qayta urinish
              </button>
            </div>
          ) : withValue.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium">
                {monthLabel(selected)} uchun yozuv yo&apos;q
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Surat har kecha 23:40 da yoziladi. Yozuv boshlangan kundan
                oldingi kunlar bo&apos;sh qoladi — ular qayta tiklanmaydi.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Bitta jumlalik xulosa — grafikka qarashdan oldin */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-bold tabular-nums">
                  {formatPrice(last?.expectedValue ?? 0)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    so&apos;m
                  </span>
                </span>
                {drift != null && drift !== 0 && (
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${
                      drift < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {drift < 0 ? (
                      <TrendingDown className="size-4" />
                    ) : (
                      <TrendingUp className="size-4" />
                    )}
                    {drift > 0 ? "+" : ""}
                    {formatPrice(drift)} — oy boshidan
                  </span>
                )}
              </div>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={points}
                    margin={{ top: 12, right: 12, bottom: 0, left: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(100, 116, 139, 0.18)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={{ stroke: "rgba(100, 116, 139, 0.25)" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      domain={[min - pad, max + pad]}
                      tickFormatter={compact}
                    />
                    <RechartsTooltip
                      content={<ChartTooltip />}
                      cursor={{ stroke: "rgba(100, 116, 139, 0.35)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="expectedValue"
                      stroke={LINE}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      // A day nobody wrote must read as a GAP, not as a line
                      // drawn straight through it.
                      connectNulls={false}
                    />
                    {notable.map((p) => (
                      <ReferenceDot
                        key={p.date}
                        x={p.day}
                        y={p.expectedValue as number}
                        r={5}
                        fill={
                          (p.delta as number) < 0 ? "#dc2626" : "#16a34a"
                        }
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Sabablar — grafikdagi nuqtalarning izohi */}
              {notable.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Nima bo&apos;ldi
                  </p>
                  <div className="space-y-1">
                    {notable.map((p) => (
                      <div
                        key={p.date}
                        className="flex items-baseline gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                      >
                        <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                          {p.day}-kun
                        </span>
                        <span
                          className={`w-28 shrink-0 font-medium tabular-nums ${
                            (p.delta as number) < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {(p.delta as number) > 0 ? "+" : ""}
                          {formatPrice(p.delta as number)}
                        </span>
                        <span className="text-muted-foreground">
                          {eventText(p.events)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                  Bu oyda raqamni sezilarli siljitgan voqea qayd etilmagan.
                </p>
              )}

              <p className="border-t pt-3 text-xs text-muted-foreground">
                Chiziq faqat <strong>kutilayotgan</strong> raqamni ko&apos;rsatadi
                — o&apos;zgarganda nimadir sodir bo&apos;lgan degani. O&apos;tilgan
                darslar va yig&apos;ilgan pul har kuni tabiiy o&apos;sadi,
                shuning uchun ular alohida chiziq emas: kursorni olib borsangiz
                o&apos;sha kunning raqamlarida ko&apos;rinadi.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
