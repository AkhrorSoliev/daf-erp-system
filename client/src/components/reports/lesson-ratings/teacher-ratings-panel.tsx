"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/payments/overview/block-state";
import { monthShort } from "@/components/payments/salary-utils";
import { useTeacherRatings } from "./queries";
import { averageText, dayText } from "./rating-format";

/** Bitta ustozning baholari: 6 oy, guruhlar, izohlar (spec §6.3–6.4). */
export function TeacherRatingsPanel({ teacherId, month }: { teacherId: number; month: string }) {
  const q = useTeacherRatings(teacherId, month);
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <BlockError title="Baholar" onRetry={() => q.refetch()} />;
  const { months, groups, comments } = q.data;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium">Oylar bo&apos;yicha</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {months.map((m) => (
            <div key={m.month} className="rounded-md border p-2 text-center">
              <p className="text-xs text-muted-foreground">{monthShort(m.month)}</p>
              <p className="font-medium">{averageText(m.average)}</p>
              <p className="text-xs text-muted-foreground">{m.rated} ta baho</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Guruhlar bo&apos;yicha</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu oyda baho yo&apos;q</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {groups.map((g) => (
              <li key={g.groupId} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/groups/${g.groupId}`} className="hover:underline">
                  {g.name}
                </Link>
                <span>
                  {averageText(g.average)} · {g.rated} ta
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Izohlar</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu oyda izoh yozilmagan</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={`${c.studentId}-${c.date}-${i}`} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{dayText(c.date)}</span>
                  <span>{c.groupName}</span>
                  <Link href={`/students/profile/${c.studentId}`} className="hover:underline">
                    {c.studentName}
                  </Link>
                  <span>{c.score} ⭐</span>
                </div>
                <p>{c.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
