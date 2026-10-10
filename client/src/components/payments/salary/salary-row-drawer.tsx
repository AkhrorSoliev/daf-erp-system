"use client";

import { useState } from "react";
import { CheckCircle, Download, HandCoins, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CanLink } from "@/components/shared/can-link";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { currentMonthKey, monthLabel } from "../salary-utils";
import { csvFromLessons, drawerButtons, drawerHint } from "./salary-drawer-model";
import { SalaryDrawerBody } from "./salary-drawer-sections";
import { useInvalidateSalary, useSalaryDetail } from "./salary-queries";
import type { BreakdownLine, MonthStateKind, SalaryDetail } from "./salary-types";

interface Props {
  userId: number | null;
  month: string;
  /** The page's `monthState.kind`; the detail answer does not carry it. */
  state?: MonthStateKind;
  onClose: () => void;
  /** «Berildi»: the drawer closes first, then the pay dialog opens on this person. */
  onPay: (detail: SalaryDetail) => void;
  canClose: boolean;
  canPay: boolean;
}

/** Row click on «Ish haqi» (spec §2.5): one person's month, in any state. */
export function SalaryRowDrawer({ userId, month, state, onClose, onPay, canClose, canPay }: Props) {
  const { data, isError, isFetching, refetch } = useSalaryDetail(userId, month);
  // Until the page's answer arrives: OPEN is exactly "the current Tashkent month" (spec §4).
  const kind = state ?? (month === currentMonthKey() ? "OPEN" : "NOT_CALCULATED");
  const user = data?.row.user;
  // The table's own words: «Ustoz», or the staff member's position.
  const role = user && "position" in user ? user.position?.trim() || "Xodim" : "Ustoz";
  const name = user ? `${user.firstName} ${user.lastName}` : "Xodim";

  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the name clear of the sheet's own close button. */}
          <SheetTitle className="truncate pr-8">
            {data?.kind === "teacher" && user ? (
              <CanLink perm="teachers.view" href={`/teachers/profile/${user.id}?tab=ish-haqi`} linkClassName="hover:underline">
                {name}
              </CanLink>
            ) : (
              name
            )}
          </SheetTitle>
          <SheetDescription>{data ? `${role} · ${monthLabel(data.month)}` : "Yuklanmoqda…"}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {data ? (
            <SalaryDrawerBody detail={data} state={kind} />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                Qayta urinish
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full rounded-lg" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}
        </div>

        {data && (
          <DrawerActions
            detail={data}
            state={kind}
            canClose={canClose}
            canPay={canPay}
            onPay={() => {
              onClose();
              onPay(data);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerActions({
  detail,
  state,
  canClose,
  canPay,
  onPay,
}: {
  detail: SalaryDetail;
  state: MonthStateKind;
  canClose: boolean;
  canPay: boolean;
  onPay: () => void;
}) {
  const invalidate = useInvalidateSalary();
  const [busy, setBusy] = useState<"csv" | "approve" | null>(null);
  const payment = detail.row.payment?.status === "CANCELLED" ? null : detail.row.payment;
  const buttons = drawerButtons(state, payment, canClose, canPay);

  const downloadCsv = async () => {
    setBusy("csv");
    try {
      // A calculated month: the payment's accruals; otherwise the month's live ones.
      const { data } = payment
        ? await api.get<{ lines: BreakdownLine[] }>(`/salary/payments/${payment.id}/breakdown`)
        : await api.get<{ lines: BreakdownLine[] }>(`/salary/monthly/user/${detail.row.user.id}/lessons`, {
            params: { month: detail.month },
          });
      const url = URL.createObjectURL(new Blob([csvFromLessons(data.lines)], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `darslar-${detail.row.user.id}-${detail.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, "Faylni yuklab bo'lmadi"));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!payment) return;
    setBusy("approve");
    try {
      await api.patch(`/salary/payments/${payment.id}/approve`);
      toast.success("Tasdiqlandi");
      // Financial data: refetch, never patch the cache by hand.
      await invalidate();
    } catch (err) {
      toast.error(getErrorMessage(err, "Tasdiqlashda xatolik"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SheetFooter className="border-t px-6 py-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={downloadCsv} disabled={busy !== null}>
          {busy === "csv" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          Darslar bo&apos;yicha (CSV)
        </Button>
        {buttons.approve && (
          <Button onClick={approve} disabled={buttons.approve === "disabled" || busy !== null}>
            {busy === "approve" ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <CheckCircle data-icon="inline-start" />
            )}
            Tasdiqlash
          </Button>
        )}
        {buttons.pay && (
          <Button onClick={onPay} disabled={buttons.pay === "disabled" || busy !== null}>
            <HandCoins data-icon="inline-start" />
            Berildi
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{drawerHint(state, payment, detail.month)}</p>
    </SheetFooter>
  );
}
