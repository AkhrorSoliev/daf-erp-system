"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { drawerState, type DrawerState } from "@/components/payments/list/payment-drawer-model";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { drawerSubtitle, PAY_STATUS_LABEL, PAY_STATUS_TONE, pctText, STUDENT_MARK_LABEL, studentAmountText } from "./group-payments-format";
import { useGroupPaymentsGroup } from "./group-payments-queries";
import { TONE_PILL } from "./group-payments-table";
import type { GpGroupResponse } from "./group-payments-types";

/** Row click on «Guruhlar» (spec B5 §3.6): the group's students of the page's month. Closing deletes `?guruh=`. */
export function GroupDrawer({ groupId, oy, onClose }: { groupId: string | null; oy: string | undefined; onClose: () => void }) {
  const query = useGroupPaymentsGroup(groupId, oy);
  const state = drawerState(query.error);
  const data = query.data;
  return (
    <Sheet open={groupId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the title clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{data?.group.name ?? "Guruh"}</SheetTitle>
            <SheetDescription>{data ? drawerSubtitle(data.group, data.students.length) : state === "ok" ? "Yuklanmoqda…" : ""}</SheetDescription>
          </div>
        </SheetHeader>
        <GroupDrawerContent state={state} data={data} onClose={onClose} onRetry={() => query.refetch()} />
      </SheetContent>
    </Sheet>
  );
}

/** Everything under the header, per state. No Sheet parts inside, so a test renders it alone. */
export function GroupDrawerContent({ state, data, onClose, onRetry }: {
  state: DrawerState;
  data: GpGroupResponse | undefined;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (state === "notFound") {
    return (
      <div className="space-y-3 p-6 text-sm">
        <p className="font-medium">Bu guruh tanlangan oyda topilmadi</p>
        <Button variant="outline" onClick={onClose}>Yopish</Button>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="space-y-3 p-6 text-sm">
        <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        <Button variant="outline" onClick={onRetry}>Qayta urinish</Button>
      </div>
    );
  }
  if (!data) return <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">To&apos;landi {pctText(data.paidPct)} · qoldi</p>
          <p className={cn("font-heading text-2xl font-semibold tabular-nums", data.unpaid > 0 && "text-destructive")}>{formatPrice(data.unpaid)} so&apos;m</p>
        </div>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O&apos;quvchilar</h3>
          <ul className="divide-y">
            {data.students.map((s) => {
              const name = `${s.firstName} ${s.lastName}`.trim();
              return (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {s.mark === "arxivda" ? name : <Link href={`/students/profile/${s.id}`} className="hover:underline">{name}</Link>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID {s.id}
                      {s.mark && <span className={cn(PILL_BASE, "ml-2 bg-muted text-muted-foreground")}>{STUDENT_MARK_LABEL[s.mark]}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn(PILL_BASE, TONE_PILL[PAY_STATUS_TONE[s.status]])}>{PAY_STATUS_LABEL[s.status]}</span>
                    <div className="mt-1 text-xs tabular-nums text-muted-foreground">{studentAmountText(s)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {(!data.group.deleted || data.unpaid > 0) && (
        <div className="flex flex-wrap gap-2 border-t px-6 py-4">
          {!data.group.deleted && (
            <Button variant="outline" asChild>
              <Link href={`/groups/${data.group.id}`}>Guruh sahifasi</Link>
            </Button>
          )}
          {data.unpaid > 0 && (
            <Button variant="outline" asChild>
              <Link href={`/payments/debt?groupIds=${encodeURIComponent(data.group.id)}`}>Qarzdorlik</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
