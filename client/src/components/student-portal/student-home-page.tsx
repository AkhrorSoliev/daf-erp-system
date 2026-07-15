"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import { formatWeekdays } from "@/lib/weekdays";
import {
  QrCode,
  CaretRight,
  Clock,
  GraduationCap,
  MapPin,
  BookOpen,
  CloudSlash,
  Users,
} from "@phosphor-icons/react";
import {
  Screen,
  ScreenHeader,
  FadeIn,
  Card,
  Button,
  ProgressBar,
  EmptyState,
  LoadingCards,
  Badge,
} from "./lumio";
import { useStudentProfile } from "./lib/queries";
import type { AttendanceStats, ProfileGroup } from "./lib/types";
import { QrScanDialog } from "./qr-scan-dialog";

const DAY_BY_INDEX = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function percentColor(p: number): string {
  if (p >= 75) return "text-success";
  if (p >= 50) return "text-amber-600";
  return "text-danger";
}

function GroupCard({ group }: { group: ProfileGroup }) {
  return (
    <Card className="space-y-2.5">
      <div>
        <p className="font-display text-lg font-bold text-ink-900">
          {group.name}
        </p>
        {group.course_name ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink-500">
            <BookOpen size={14} weight="bold" />
            {group.course_name}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-semibold text-ink-500">
        {group.exactDays.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <Clock size={14} weight="bold" />
            {formatWeekdays(group.exactDays)}
            {group.lessonStartTime ? ` · ${group.lessonStartTime}` : ""}
          </span>
        ) : null}
        {group.teachers.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <GraduationCap size={14} weight="bold" />
            {group.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")}
          </span>
        ) : null}
        {group.room ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={14} weight="bold" />
            {group.room.name}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function StudentHomePage() {
  const [qrOpen, setQrOpen] = useState(false);
  const { data: profile, isLoading, isError, refetch } = useStudentProfile();
  const { data: stats } = useQuery<AttendanceStats>({
    queryKey: ["student-portal", "attendance-stats"],
    queryFn: () =>
      api.get("/student-portal/attendance/stats").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <Screen>
        <LoadingCards />
      </Screen>
    );
  }

  if (isError || !profile) {
    return (
      <EmptyState
        icon={<CloudSlash weight="bold" />}
        title="Ma'lumotni yuklab bo'lmadi"
        description="Internetni tekshirib, sahifani qayta yuklang."
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Qayta urinish
          </Button>
        }
      />
    );
  }

  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const inDebt = profile.balance < 0;
  const todayKey = DAY_BY_INDEX[new Date().getDay()];
  const todayLessons = (profile.groups ?? [])
    .filter((g) => g.exactDays.map((d) => d.toLowerCase()).includes(todayKey))
    .sort((a, b) =>
      (a.lessonStartTime ?? "").localeCompare(b.lessonStartTime ?? ""),
    );

  return (
    <Screen>
      <ScreenHeader subtitle="Assalomu alaykum" title={name} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Balance hero */}
        <FadeIn index={0}>
          <div className="clay-coral overflow-hidden rounded-card bg-coral-500 p-5 text-white">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/80">
              Balans
            </p>
            <p className="mt-1 font-display text-[34px] font-extrabold leading-none">
              {formatBalance(profile.balance)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-pill bg-white/20 px-3 py-1 text-xs font-bold">
                {inDebt ? "Qarzdorlik mavjud" : "Joriy balans"}
              </span>
              <Link
                href="/portal/payments"
                className="inline-flex h-9 items-center rounded-pill bg-white px-4 font-display text-sm font-bold text-coral-600"
              >
                To&apos;ldirish
              </Link>
            </div>
          </div>
        </FadeIn>

        {/* QR attendance CTA */}
        <FadeIn index={1} className="lg:flex lg:items-stretch">
          <Button
            variant="teal"
            block
            size="lg"
            iconBefore={<QrCode size={22} weight="bold" />}
            onClick={() => setQrOpen(true)}
            className="lg:h-full"
          >
            QR bilan davomatga belgilash
          </Button>
        </FadeIn>
      </div>

      {/* Attendance summary → full screen */}
      {stats ? (
        <FadeIn index={2}>
          <Link href="/portal/attendance" className="block">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold text-ink-900">
                  Davomat
                </p>
                <span className="flex items-center gap-1">
                  <span
                    className={`font-display text-[22px] font-extrabold ${percentColor(stats.percentage)}`}
                  >
                    {stats.percentage}%
                  </span>
                  <CaretRight size={18} weight="bold" className="text-ink-400" />
                </span>
              </div>
              {stats.total > 0 ? (
                <ProgressBar
                  segments={[
                    { value: stats.present, color: "var(--success)" },
                    { value: stats.late, color: "var(--warning)" },
                    { value: stats.absent, color: "var(--danger)" },
                    { value: stats.excused, color: "var(--ink-400)" },
                  ]}
                />
              ) : null}
            </Card>
          </Link>
        </FadeIn>
      ) : null}

      {/* Today's lessons → full schedule */}
      <FadeIn index={3}>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-lg font-bold text-ink-900">
              Bugungi darslar
            </h2>
            <Link
              href="/portal/schedule"
              className="flex items-center gap-0.5 text-sm font-bold text-coral-600"
            >
              Butun jadval
              <CaretRight size={16} weight="bold" />
            </Link>
          </div>
          {todayLessons.length === 0 ? (
            <p className="px-1 text-sm font-semibold text-ink-500">
              Bugun dars yo&apos;q
            </p>
          ) : (
            <div className="grid gap-2.5 lg:grid-cols-2">
              {todayLessons.map((l) => (
                <Card key={l.id} className="flex items-center gap-3.5">
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-coral-500/10 py-2">
                    <span className="font-display text-[17px] font-extrabold text-coral-600">
                      {l.lessonStartTime ?? "—"}
                    </span>
                    {l.lessonEndTime ? (
                      <span className="text-xs font-semibold text-coral-600/70">
                        {l.lessonEndTime}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-ink-900">
                      {l.name}
                    </p>
                    {l.course_name ? (
                      <p className="truncate text-sm font-semibold text-ink-500">
                        {l.course_name}
                      </p>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </FadeIn>

      {/* My groups */}
      <FadeIn index={4}>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <h2 className="font-display text-lg font-bold text-ink-900">
              Guruhlarim
            </h2>
            {profile.groups.length > 0 ? (
              <Badge tone="grape" size="sm">
                {profile.groups.length}
              </Badge>
            ) : null}
          </div>
          {profile.groups.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-8 text-center">
              <Users size={32} weight="bold" className="text-ink-400" />
              <p className="font-display font-bold text-ink-900">
                Faol guruh yo&apos;q
              </p>
              <p className="text-sm font-semibold text-ink-500">
                Hozircha hech qanday guruhga yozilmagansiz
              </p>
            </Card>
          ) : (
            <div className="grid gap-2.5 lg:grid-cols-2">
              {profile.groups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </div>
      </FadeIn>

      <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />
    </Screen>
  );
}
