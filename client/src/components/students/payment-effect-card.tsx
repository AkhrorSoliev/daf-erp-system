"use client";

import { format } from "date-fns";
import { ArrowDownLeft, BookOpen, Coins, Wallet } from "lucide-react";
import type { StudentTransaction } from "./student-profile-tabs-utils";

/**
 * "Bu pul nimaga ketdi" — bitta to'lovning taqdiri.
 *
 * Ataylab QILINMAGAN narsalar, har biri sababi bilan:
 *
 * - **Balans strelkasi yo'q** (`−233 327 → 166 673`). U ostidagi qatorlar bilan
 *   AYNAN bir xil narsani aytardi, ustiga o'ng tomonidagi katta raqam yana
 *   "menda pul bor edi" degan o'qishni tug'dirardi — 166 673 ning 166 665 i
 *   o'sha zahoti darsga ketgan bo'lsa ham. `balanceBefore` fakti bitta oddiy
 *   jumla bo'lib qoldi; `balanceAfter` esa umuman ko'rsatilmaydi, chunki u
 *   bir soatlik oraliq holat va bugungi haqiqat pastdagi qatorda turadi.
 * - **"Jami" qatori yo'q** — sarlavhadagi `+400 000` ning o'zi jami.
 * - **Ot emas, fe'l** ("Eski qarzni yopdi", "5 ta darsga yetdi") — karta
 *   jadval emas, gap bo'lib o'qilsin.
 */

const fmt = (n: number) => n.toLocaleString("uz-UZ");
const day = (iso: string | null) => (iso ? format(new Date(iso), "dd.MM") : null);

function range(first: string | null, last: string | null): string | null {
  const a = day(first);
  const b = day(last);
  if (!a) return null;
  return !b || a === b ? a : `${a} — ${b}`;
}

function Line({
  icon,
  label,
  sub,
  amount,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string | null;
  amount: number;
  muted?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className={muted ? "text-muted-foreground" : "text-foreground"}>
            {label}
          </span>
          {sub && (
            <span className="block text-xs text-muted-foreground">{sub}</span>
          )}
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
  unpaidLessons,
}: {
  transaction: StudentTransaction;
  /** O'quvchining BUGUNGI balansi — kartadagi holat emas. */
  currentBalance: number;
  isLatestPayment: boolean;
  perLessonCost: number | null;
  /**
   * Yuqoridagi balans kartasi bilan BIR XIL manbadan (`unpaidLessonsCount`).
   * Ilgari bu yerda balansdan `ceil()` bilan hisoblanardi — bitta sahifada
   * ikkita raqam paydo bo'lish xavfi bor edi.
   */
  unpaidLessons: number;
}) {
  const dest = t.destination;
  const debtBefore = Math.max(0, -t.balanceBefore);

  // 8 so'm "ishlatilmay qoldi" desa, nega ishlatilmagani so'raladi. Sababi
  // oddiy: bir darsga yetmagan.
  const shortOfLesson =
    !!dest &&
    dest.unspent > 0 &&
    !!perLessonCost &&
    dest.unspent < perLessonCost;

  // Aytadigan gap bo'lmasa — sarlavhani yolg'iz qoldirgandan ko'ra
  // butun blokni ko'rsatmagan ma'qul.
  const hasSomethingToSay = debtBefore > 0 || !!dest || isLatestPayment;
  if (!hasSomethingToSay) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Bu pul nimaga ketdi
      </p>

      {debtBefore > 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          To&apos;lovdan oldin{" "}
          <span className="font-medium text-foreground">
            {fmt(debtBefore)} so&apos;m
          </span>{" "}
          qarz bor edi
        </p>
      )}

      {dest && dest.reconciled ? (
        <ul className="space-y-2 text-sm">
          {dest.toPreviousDebt > 0 && (
            <Line
              icon={
                <ArrowDownLeft className="size-4 text-amber-600 dark:text-amber-400" />
              }
              label="Eski qarzni yopdi"
              sub={[
                dest.debtLessonCount > 0 ? `${dest.debtLessonCount} dars` : null,
                range(dest.debtFirstLessonDate, dest.debtLastLessonDate),
              ]
                .filter(Boolean)
                .join(" · ")}
              amount={dest.toPreviousDebt}
            />
          )}

          {dest.toLessons > 0 && (
            <Line
              icon={
                <BookOpen className="size-4 text-blue-600 dark:text-blue-400" />
              }
              label={
                dest.lessonCount > 0
                  ? `${dest.lessonCount} ta darsga yetdi`
                  : "Darslarga yetdi"
              }
              sub={range(dest.firstLessonDate, dest.lastLessonDate)}
              amount={dest.toLessons}
            />
          )}

          {dest.toOther > 0 && (
            <Line
              icon={<Wallet className="size-4 text-slate-500" />}
              label="Boshqa yechimlarga ketdi"
              sub="pul qaytarish, imtihon to'lovi"
              amount={dest.toOther}
            />
          )}

          {dest.unspent > 0 && (
            <Line
              icon={<Coins className="size-4 text-slate-500" />}
              label="Ishlatilmay qoldi"
              sub={shortOfLesson ? "bir darsga yetmadi" : null}
              amount={dest.unspent}
              muted
            />
          )}
        </ul>
      ) : dest ? (
        <p className="text-xs text-muted-foreground">
          Bu o&apos;quvchining ledger zanjiri mos kelmadi — taqsimot
          ko&apos;rsatilmaydi.
        </p>
      ) : null}

      {isLatestPayment && (
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          Bugun:{" "}
          {currentBalance < 0 ? (
            <>
              <span className="font-medium text-destructive">
                {fmt(Math.abs(currentBalance))} so&apos;m qarz
              </span>
              {unpaidLessons > 0 && ` · ${unpaidLessons} ta dars to'lanmagan`}
            </>
          ) : currentBalance > 0 ? (
            <span className="font-medium text-foreground">
              {fmt(currentBalance)} so&apos;m oldindan to&apos;langan
            </span>
          ) : (
            <span className="font-medium text-foreground">qarz yo&apos;q</span>
          )}
        </p>
      )}
    </div>
  );
}
