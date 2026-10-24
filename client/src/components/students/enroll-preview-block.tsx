"use client";

import { Calendar as CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";
import { formatBalance, formatPrice } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";
import { useT } from "@/i18n/context";
// The dialog's enroll call sends the picked day through the same helper, so
// the preview quotes the very day that gets enrolled.
import { toApiDateStr } from "@/components/groups/edit-group-form-utils";

/**
 * `GET /students/:id/enroll-preview`: what enrolling the student into the group
 * would charge, worked out by the server (A3.4). Nothing in it is added up on
 * the client.
 */
export interface EnrollPreview {
  paymentModel: "MONTHLY" | "LESSON_PACK";
  /** The monthly price for MONTHLY, the pack price otherwise. */
  coursePrice: number;
  /** Lessons in one pack; null for a monthly course. */
  lessonPaymentCount: number | null;
  /** The student's discount, 0–100. */
  discountPercent: number;
  /**
   * MONTHLY only (null for a pack): the first charge the student will actually
   * get, which can be next month's. Null when the group is not ACTIVE, or when
   * neither this month nor the next has anything to charge.
   */
  firstMonth: {
    /** `YYYY-MM`. */
    period: string;
    plannedLessons: number;
    coveredLessons: number;
    amount: number;
  } | null;
  /** The student's balance now; negative is a debt. */
  balance: number;
  /**
   * A transfer: what the old group's month gives back before the new group is
   * charged; 0 otherwise.
   */
  transferRelease: number;
  /** What is still to pay after the balance, as the server worked it out. */
  payable: number;
}

/**
 * The start-date picker and the money of enrolling into the selected group.
 * The money is informational: enrolling is never held up by it (an unpaid
 * student is the debtors panel's business), so while it loads, and when the
 * request fails, the picker stays and the money lines are left out. There is
 * no client-side fallback.
 */
export function EnrollPreviewBlock({
  studentId,
  groupId,
  startDate,
  onStartDateChange,
}: {
  studentId: number;
  groupId: string;
  startDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
}) {
  const t = useT();
  const day = startDate ? toApiDateStr(startDate) : null;
  const { data: preview, isLoading, isError } = useQuery<EnrollPreview>({
    queryKey: ["enroll-preview", studentId, groupId, day],
    queryFn: () =>
      api
        .get<EnrollPreview>(`/students/${studentId}/enroll-preview`, {
          params: { groupId, ...(day && { startDate: day }) },
        })
        .then((r) => r.data),
    // The balance and today's date both move, so an old answer is never reused
    // as a fresh one. No retries: the money is only informational, so a
    // failure drops the lines at once instead of holding «Hisoblanmoqda…».
    staleTime: 0,
    retry: false,
  });

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CalendarIcon className="size-3.5" />
        {t("Boshlanish sanasi (qaysi darsdan)")}
      </div>
      <DatePicker
        value={startDate}
        onChange={onStartDateChange}
        placeholder={t("Bugundan boshlab")}
      />
      {isLoading && (
        <p className="text-xs text-muted-foreground">{t("Hisoblanmoqda…")}</p>
      )}
      {/* A failed refetch keeps the last good answer in `preview`; on an error
          there are no money lines, whatever is cached. */}
      {preview && !isError && <PreviewLines preview={preview} />}
    </div>
  );
}

function PreviewLines({ preview }: { preview: EnrollPreview }) {
  const t = useT();
  const {
    paymentModel,
    coursePrice,
    lessonPaymentCount,
    discountPercent,
    firstMonth,
    balance,
    transferRelease,
    payable,
  } = preview;
  return (
    <div className="space-y-1.5 text-xs">
      {paymentModel === "MONTHLY" ? (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("Oylik narx:")}</span>
            <span className="font-mono tabular-nums font-semibold">
              {formatPrice(coursePrice)} {t("so'm")}
            </span>
          </div>
          {firstMonth ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {discountPercent > 0
                  ? t("{month} uchun ({covered}/{planned} dars) · chegirma {percent}%:", {
                      month: monthShort(firstMonth.period, t),
                      covered: firstMonth.coveredLessons,
                      planned: firstMonth.plannedLessons,
                      percent: discountPercent,
                    })
                  : t("{month} uchun ({covered}/{planned} dars):", {
                      month: monthShort(firstMonth.period, t),
                      covered: firstMonth.coveredLessons,
                      planned: firstMonth.plannedLessons,
                    })}
              </span>
              <span className="font-mono tabular-nums font-semibold">
                {formatPrice(firstMonth.amount)} {t("so'm")}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {t("Hisob guruh darslari boshlanganda yoziladi")}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("Kurs narxi ({n} dars):", { n: lessonPaymentCount ?? 0 })}
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {formatPrice(coursePrice)} {t("so'm")}
            </span>
          </div>
          {discountPercent > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Chegirma:")}</span>
              <span className="font-mono tabular-nums">{discountPercent}%</span>
            </div>
          )}
        </>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("O'quvchi balansi:")}</span>
        <span
          className={`font-mono tabular-nums ${balance < 0 ? "text-destructive" : ""}`}
        >
          {formatBalance(balance, t("so'm"))}
        </span>
      </div>
      {/* 0 (not a transfer): no line. */}
      {transferRelease > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Eski guruhdan qaytadi:")}</span>
          <span className="font-mono tabular-nums">
            {formatPrice(transferRelease)} {t("so'm")}
          </span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1.5 font-semibold">
        <span>{t("To'lash kerak (taxminan):")}</span>
        <span
          className={`font-mono tabular-nums ${
            payable > 0
              ? "text-destructive"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {payable > 0 ? `${formatPrice(payable)} ${t("so'm")}` : t("Yetarli")}
        </span>
      </div>
    </div>
  );
}
