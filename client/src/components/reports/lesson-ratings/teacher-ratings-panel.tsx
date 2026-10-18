"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/payments/overview/block-state";
import { monthShort } from "@/components/payments/salary-utils";
import { formatNumber } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { useTeacherRatings } from "./queries";
import { averageText, dayText } from "./rating-format";
import { ExpandableText } from "./expandable-text";

/** Bitta ustozning baholari: 6 oy, guruhlar, izohlar (spec §6.3–6.4). */
export function TeacherRatingsPanel({ teacherId, month }: { teacherId: number; month: string }) {
  const t = useT();
  const q = useTeacherRatings(teacherId, month);
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <BlockError title={t("Baholar")} onRetry={() => q.refetch()} />;
  const { months, groups, comments } = q.data;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium">{t("Oylar bo'yicha")}</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {months.map((m) => (
            <div key={m.month} className="rounded-md border p-2 text-center">
              <p className="text-xs text-muted-foreground">{monthShort(m.month, t)}</p>
              <p className="font-medium">{averageText(m.average)}</p>
              <p className="text-xs text-muted-foreground">{t("{n} ta baho", { n: formatNumber(m.rated) })}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">{t("Guruhlar bo'yicha")}</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bu oyda baho yo'q")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {groups.map((g) => (
              <li key={g.groupId} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/groups/${g.groupId}`} className="hover:underline">
                  {g.name}
                </Link>
                <span>
                  {t("{avg} · {n} ta", { avg: averageText(g.average), n: formatNumber(g.rated) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">{t("Izohlar")}</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bu oyda izoh yozilmagan")}</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={`${c.date}-${i}`} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{dayText(c.date)}</span>
                  <span>{c.groupName}</span>
                  <span>{c.score} ⭐</span>
                </div>
                <ExpandableText text={c.comment} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
