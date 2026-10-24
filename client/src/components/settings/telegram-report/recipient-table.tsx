import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { cn } from "@/lib/utils";
import type { BranchOption, Recipient } from "./telegram-report-api";
import type { ReportLayout } from "./telegram-report-labels";
import { branchSummary, reachMeta, type ReachMeta } from "./recipient-view";

const LAYOUT_SHORT: Record<ReportLayout, string> = {
  BY_SECTION: msg("Bo'lim"),
  TABLE: msg("Jadvalli"),
  BY_BRANCH: msg("Filial"),
  TOTAL_ONLY: msg("Jami"),
};

const TONE: Record<ReachMeta["tone"], string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  off: "bg-muted text-muted-foreground",
};

export function ReachPill({ meta }: { meta: ReachMeta }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium", TONE[meta.tone])}>
      {meta.label}
    </span>
  );
}

const COLUMNS = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_64px_72px_44px]";

interface Props {
  rows: Recipient[];
  branches: BranchOption[];
  selectedId: number | null;
  now: Date;
  onSelect: (id: number) => void;
  onToggle: (id: number, isActive: boolean) => void;
  /** A save is pending: the switch waits for the refetch, like the panel. */
  busy: boolean;
  empty: string;
}

export function RecipientTable({ rows, branches, selectedId, now, onSelect, onToggle, busy, empty }: Props) {
  const t = useT();
  return (
    <div role="grid" aria-label={t("Hisobot oluvchilar")} className="overflow-hidden rounded-xl border">
      <div
        role="row"
        className={cn("hidden gap-x-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", COLUMNS)}
      >
        <span role="columnheader">{t("Xodim")}</span>
        <span role="columnheader">{t("Telegram")}</span>
        <span role="columnheader">{t("Vaqt")}</span>
        <span role="columnheader">{t("Shakl")}</span>
        <span role="columnheader" className="sr-only">{t("Yoqilgan")}</span>
      </div>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>}
      {rows.map((r) => {
        const meta = reachMeta(r, now, t);
        const layout = LAYOUT_SHORT[r.layout];
        const selected = r.id === selectedId;
        return (
          <div
            key={r.id}
            role="row"
            aria-selected={selected}
            onClick={() => onSelect(r.id)}
            className={cn(
              "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40",
              COLUMNS,
              selected && "bg-muted/60",
            )}
          >
            <div role="gridcell" className="min-w-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(r.id); }}
                className="block w-full min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.position ? `${r.position} · ` : ""}{branchSummary(r, branches, t)}
                </span>
              </button>
            </div>
            <div role="gridcell" className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
              <ReachPill meta={meta} />
              <span className="min-w-0 truncate text-xs text-muted-foreground">{meta.note}</span>
            </div>
            <span role="gridcell" className="hidden text-sm tabular-nums md:block">{r.sendTime}</span>
            <span role="gridcell" className="hidden text-sm md:block">{t(layout)}</span>
            <div role="gridcell" className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
              <Switch
                checked={r.isActive}
                aria-label={t("Yoqilgan")}
                disabled={busy}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={(v) => onToggle(r.id, v)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
