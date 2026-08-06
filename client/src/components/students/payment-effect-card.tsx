"use client";

import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowRight,
  BookOpen,
  Coins,
  Wallet,
} from "lucide-react";
import type { StudentTransaction } from "./student-profile-tabs-utils";

/**
 * "Bu to'lovdan keyin" — to'lov nimani o'zgartirganini ko'rsatadi.
 *
 * Ikki qatlam, ataylab shu tartibda:
 *   1. FAKT — balans qanchadan qanchaga o'zgardi. Bu ledger qatorining O'Z
 *      maydonlari (`balanceBefore` / `balanceAfter`), hech qanday hisob-kitob
 *      yo'q, shuning uchun uni noto'g'ri hisoblab bo'lmaydi.
 *   2. TAQSIMOT — pul qaysi qarzga va qaysi darslarga ketgani.
 *
 * "Balansga qoldi" iborasi ATAYLAB yo'q. Aynan o'sha so'z o'quvchini
 * "menda pul bor edi" degan xato xulosaga olib kelgan: karta 233 339 so'm
 * "balansda qoldi" deb turgan paytda o'quvchi 33 325 so'm qarzdor edi.
 */

const fmt = (n: number) => n.toLocaleString("uz-UZ");
const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${fmt(Math.abs(n))}`;
const day = (iso: string | null) => (iso ? format(new Date(iso), "dd.MM") : null);

/** "(3 dars · 07.07 — 18.07)" — sana bo'lmasa faqat dars soni. */
function lessonScope(
  count: number,
  first: string | null,
  last: string | null,
): string {
  const parts: string[] = [];
  if (count > 0) parts.push(`${count} dars`);
  const a = day(first);
  const b = day(last);
  if (a) parts.push(a === b || !b ? a : `${a} — ${b}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

function Row({
  icon,
  label,
  amount,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  muted?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-foreground">
        {icon}
        <span className={muted ? "text-muted-foreground" : undefined}>
          {label}
        </span>
      </span>
      <span className="shrink-0 font-mono tabular-nums">
        {fmt(amount)} so&apos;m
      </span>
    </li>
  );
}

export function PaymentEffectCard({
  transaction: t,
  currentBalance,
  isLatestPayment,
  perLessonCost,
}: {
  transaction: StudentTransaction;
  /** O'quvchining BUGUNGI balansi — kartadagi holat emas. */
  currentBalance: number;
  isLatestPayment: boolean;
  perLessonCost: number | null;
}) {
  const dest = t.destination;
  const before = t.balanceBefore;
  const after = t.balanceAfter;

  // Manfiy balansda hech narsa yashil ko'rsatilmaydi — o'quvchi qarzdor
  // ekan, kartadagi yashil raqam "pulim bor" degan taassurot beradi.
  const inDebtNow = currentBalance < 0;
  const afterTone =
    after > 0 && !inDebtNow
      ? "text-emerald-600 dark:text-emerald-400"
      : after > 0
        ? "text-foreground"
        : "text-destructive";

  const arrowNote =
    before < 0 && after > 0
      ? "Qarz yopildi, ortidan oldindan qoldi"
      : before < 0 && after <= 0
        ? `Qarz ${fmt(t.amount)} so'mga kamaydi, lekin ${fmt(Math.abs(after))} so'm qoldi`
        : "To'liq oldindan qoldi";

  const unpaidLessons =
    inDebtNow && perLessonCost && perLessonCost > 0
      ? Math.ceil(Math.abs(currentBalance) / perLessonCost)
      : 0;

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Bu to&apos;lovdan keyin
      </p>

      {/* QATLAM 1 — fakt */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-base tabular-nums text-destructive">
          {before < 0 ? signed(before) : fmt(before)} so&apos;m
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        <span className={`font-mono text-base tabular-nums ${afterTone}`}>
          {after < 0 ? signed(after) : fmt(after)} so&apos;m
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{arrowNote}</p>

      {/* QATLAM 2 — taqsimot. Zanjir mos kelmasa UMUMAN ko'rsatilmaydi. */}
      {dest && dest.reconciled ? (
        <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          {dest.toPreviousDebt > 0 && (
            <Row
              icon={
                <ArrowDownLeft className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              }
              label={`Oldingi qarzga${lessonScope(
                dest.debtLessonCount,
                dest.debtFirstLessonDate,
                dest.debtLastLessonDate,
              )}`}
              amount={dest.toPreviousDebt}
            />
          )}
          {dest.toLessons > 0 && (
            <Row
              icon={
                <BookOpen className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
              }
              label={`Darslarga${lessonScope(
                dest.lessonCount,
                dest.firstLessonDate,
                dest.lastLessonDate,
              )}`}
              amount={dest.toLessons}
            />
          )}
          {dest.toOther > 0 && (
            <Row
              icon={<Wallet className="size-4 shrink-0 text-slate-500" />}
              label="Boshqa yechimlar (pul qaytarish, imtihon)"
              amount={dest.toOther}
            />
          )}
          {dest.unspent > 0 && (
            <Row
              icon={<Coins className="size-4 shrink-0 text-slate-500" />}
              label="Sarflanmagan qoldiq"
              amount={dest.unspent}
              muted
            />
          )}
          <li className="flex items-baseline justify-between gap-3 border-t pt-1.5 text-xs text-muted-foreground">
            <span>Jami</span>
            <span className="font-mono tabular-nums">
              {fmt(dest.amount)} so&apos;m
            </span>
          </li>
        </ul>
      ) : dest ? (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Bu o&apos;quvchining ledger zanjiri mos kelmadi — taqsimot
          ko&apos;rsatilmaydi. Yuqoridagi balans raqamlari ishonchli.
        </p>
      ) : null}

      {/* Faqat eng oxirgi to'lovda — kartadagi holat "hozir" degani emas. */}
      {isLatestPayment && (
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          Bugun: balans{" "}
          <span
            className={
              inDebtNow ? "font-medium text-destructive" : "font-medium"
            }
          >
            {currentBalance < 0 ? signed(currentBalance) : fmt(currentBalance)}{" "}
            so&apos;m
          </span>
          {unpaidLessons > 0 && ` · ${unpaidLessons} ta dars to'lanmagan`}
        </p>
      )}
    </div>
  );
}
