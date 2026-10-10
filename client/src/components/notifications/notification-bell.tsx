"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotifications } from "@/hooks/use-notifications";
import { useSSE } from "@/hooks/use-sse";
import { cn } from "@/lib/utils";
import { useNotificationActions } from "./notification-actions";
import { NotificationEmpty, NotificationRowView, NotificationSkeleton } from "./notification-row";
import {
  GROUP_LABEL,
  groupByDay,
  groupNotifications,
  panelSections,
  type NotificationGroup,
  type NotificationRow,
} from "./notification-view";

/** The panel's chips (spec §8, mockup s19); «Tizim» lives on the page. */
const CHIPS: (NotificationGroup | null)[] = [null, "task", "attendance", "payment"];

type Tab = "pending" | "all";

export function NotificationBell() {
  const badge = useNotifications((s) => s.badge);
  const chip = useNotifications((s) => s.chip);
  const fetchBadge = useNotifications((s) => s.fetchBadge);
  const loadPanel = useNotifications((s) => s.loadPanel);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");

  useSSE();

  useEffect(() => {
    void fetchBadge();
  }, [fetchBadge]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPanel(chip);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="size-4" />
              {badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Bildirishnomalar</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[400px] max-w-[calc(100vw-1rem)] p-0" align="end">
        <NotificationPanel tab={tab} onTab={setTab} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Mounts when the popover opens, so its clock («5 daqiqa oldin») is read fresh each time. */
function NotificationPanel({ tab, onTab, onClose }: { tab: Tab; onTab: (t: Tab) => void; onClose: () => void }) {
  const { pending, recent, counts, chip, loading, loadPanel, markAllRead } = useNotifications();
  const { hrefOf, onOpen } = useNotificationActions(onClose);
  const [now] = useState(() => new Date());

  const { waiting, todayInfo } = panelSections(pending, recent, now);
  const rowsOf = (rows: NotificationRow[]) =>
    rows.map((row) => <NotificationRowView key={row.key} row={row} now={now} onOpen={onOpen} hrefOf={hrefOf} />);

  return (
    <>
      <div className="space-y-2 border-b px-4 pb-2 pt-3">
        <div className="flex items-center">
          <h3 className="text-sm font-semibold">Bildirishnomalar</h3>
          <button
            type="button"
            className="ml-auto text-xs text-primary hover:underline"
            onClick={() => void markAllRead()}
          >
            {"Hammasini o'qilgan qilish"}
          </button>
        </div>
        <div className="flex gap-1">
          {(["pending", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "pending" ? "Kutilmoqda" : "Hammasi"}
              {t === "pending" && counts ? (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-primary">{counts.pending}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => (
            <button
              key={c ?? "hammasi"}
              type="button"
              onClick={() => void loadPanel(c)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                chip === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c ? GROUP_LABEL[c] : "Hammasi"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {loading && recent.length === 0 ? (
          <NotificationSkeleton />
        ) : tab === "pending" ? (
          <>
            <Section title="Sizdan kutilmoqda" />
            {waiting.length > 0 ? rowsOf(waiting) : <NotificationEmpty text="Sizdan hech narsa kutilmayapti" />}
            {todayInfo.length > 0 && (
              <>
                <Section title="Ma'lumot uchun · bugun" />
                {rowsOf(todayInfo)}
              </>
            )}
          </>
        ) : recent.length === 0 ? (
          <NotificationEmpty text="Bildirishnomalar yo'q" />
        ) : (
          groupByDay(recent, now).map((day) => (
            <div key={day.label}>
              <Section title={day.label} />
              {rowsOf(groupNotifications(day.items))}
            </div>
          ))
        )}
      </div>

      <Link
        href="/notifications"
        onClick={onClose}
        className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50"
      >
        Barcha bildirishnomalar
      </Link>
    </>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
  );
}
