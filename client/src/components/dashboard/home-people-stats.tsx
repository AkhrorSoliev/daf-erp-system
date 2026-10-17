"use client";

import Link from "next/link";
import { useT } from "@/i18n/context";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import type { DashboardPeople } from "./dashboard-summary-types";

interface PeopleStatProps {
  value: string;
  label: string;
  hint?: string;
  hintTitle?: string;
  href: string;
}

/** «351 aktiv o'quvchi +61 / −8» — one fact, read as a phrase. */
function PeopleStat({ value, label, hint, hintTitle, href }: PeopleStatProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-baseline gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="text-base font-semibold text-foreground">{value}</span>
      <span>{label}</span>
      {hint && (
        <span className="text-xs" title={hintTitle}>
          {hint}
        </span>
      )}
    </Link>
  );
}

/**
 * The people counters as one line of facts under the money strip, not a
 * second row of cards: these are context for the figures above, and a row of
 * equal tiles would give them the same weight.
 */
export function HomePeopleStats({ people }: { people: DashboardPeople }) {
  const t = useT();
  const pending =
    (people.leftPending ?? 0) > 0 && people.leftGraceDays
      ? ` ${t(
          "Yana {n} nafari qaytmasa qo'shiladi (guruhdan chiqqan {a} kun, muzlatilgan {b} kun kutiladi).",
          {
            n: people.leftPending ?? 0,
            a: people.leftGraceDays.LEFT_GROUP,
            b: people.leftGraceDays.FROZEN,
          },
        )}`
      : "";

  return (
    <section
      aria-label={t("O'quvchilar va darslar")}
      className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 px-1"
    >
      <PeopleStat
        value={formatNumber(people.activeStudents)}
        label={t("aktiv o'quvchi")}
        hint={`+${people.newThisMonth} / −${people.leftThisMonth}`}
        hintTitle={
          t("Shu oy: +{added} yangi, −{left} ketgan.", {
            added: people.newThisMonth,
            left: people.leftThisMonth,
          }) + pending
        }
        href="/students"
      />
      <PeopleStat
        value={formatNumber(people.activeGroups)}
        label={t("aktiv guruh")}
        href="/groups"
      />
      <PeopleStat
        value={formatPercent(
          people.attendancePct === null ? null : Math.round(people.attendancePct),
        )}
        label={t("davomat (bu oy)")}
        href="/reports/attendance"
      />
      <PeopleStat
        value={
          people.todayLessons === null ? "—" : formatNumber(people.todayLessons)
        }
        label={t("dars bugun")}
        hint={
          people.todayLessons === null ? t("filial tanlanmagan") : undefined
        }
        href="/schedule"
      />
    </section>
  );
}
