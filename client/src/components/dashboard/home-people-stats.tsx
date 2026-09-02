import Link from "next/link";
import { CalendarCheck, CalendarDays, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import type { DashboardPeople } from "./dashboard-summary-types";

interface PeopleStatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  href: string;
}

function PeopleStat({ icon: Icon, label, value, hint, href }: PeopleStatProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-accent/40 sm:gap-3 sm:p-3"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold tabular-nums sm:text-lg">
          {value}
          {hint && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {hint}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function HomePeopleStats({ people }: { people: DashboardPeople }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <PeopleStat
        icon={Users}
        label="Aktiv o'quvchilar"
        value={formatNumber(people.activeStudents)}
        hint={`+${people.newThisMonth} / −${people.leftThisMonth}`}
        href="/students"
      />
      <PeopleStat
        icon={UsersRound}
        label="Aktiv guruhlar"
        value={formatNumber(people.activeGroups)}
        href="/groups"
      />
      <PeopleStat
        icon={CalendarCheck}
        label="Bu oy davomat"
        value={formatPercent(people.attendancePct)}
        href="/reports/attendance"
      />
      <PeopleStat
        icon={CalendarDays}
        label="Bugungi darslar"
        value={
          people.todayLessons === null ? "—" : formatNumber(people.todayLessons)
        }
        hint={people.todayLessons === null ? "filial tanlanmagan" : undefined}
        href="/schedule"
      />
    </div>
  );
}
