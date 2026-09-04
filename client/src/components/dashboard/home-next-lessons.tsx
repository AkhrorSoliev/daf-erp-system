"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, DoorOpen, Users } from "lucide-react";
import { pickNextLessons } from "./dashboard-home-visibility";
import type { DashboardNextLesson } from "./dashboard-summary-types";

/** "HH:mm" ko'rinishidagi hozirgi mahalliy vaqt. */
function nowHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function HomeNextLessons({
  lessons,
}: {
  lessons: DashboardNextLesson[] | null;
}) {
  // `DashboardClient` foydalanuvchi hydrate bo'lgunicha skeleton chizadi, ya'ni
  // bu blok serverda hech qachon render qilinmaydi — shuning uchun boshlang'ich
  // qiymatni to'g'ridan-to'g'ri hisoblash xavfsiz. Jadval komponentidagi naqsh.
  const [now, setNow] = useState(nowHhMm);
  useEffect(() => {
    const id = setInterval(() => setNow(nowHhMm()), 60_000);
    return () => clearInterval(id);
  }, []);

  const next = lessons ? pickNextLessons(lessons, now) : [];

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-semibold">
          <CalendarDays className="size-4 text-muted-foreground" />
          Keyingi darslar
        </h2>
        <Link
          href="/schedule"
          className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          To&apos;liq jadval
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {lessons === null ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Jadval bitta filialning xonalari va ish vaqti bo&apos;yicha chiziladi,
          shuning uchun &laquo;Barcha filiallar&raquo; ko&apos;rinishida
          ko&apos;rsatilmaydi. Yuqoridagi almashtirgichdan filialni tanlang.
        </p>
      ) : next.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Bugungi darslar tugadi.
        </p>
      ) : (
        <ul className="divide-y">
          {next.map((l) => (
            <li key={l.groupId}>
              <Link
                href={`/groups/${l.groupId}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <span className="w-11 shrink-0 text-sm font-semibold tabular-nums">
                  {l.startTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {l.groupName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.teacherName ?? "O'qituvchi belgilanmagan"}
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <DoorOpen className="size-3.5" />
                  {l.roomName ?? "—"}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {l.studentCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
