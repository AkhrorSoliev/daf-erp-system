"use client";

import Link from "next/link";
import {
  Wallet,
  ChartLineUp,
  QrCode,
  Gear,
  Question,
  Info,
  CaretRight,
} from "@phosphor-icons/react";
import { Screen, ScreenHeader, FadeIn, ListRow, Avatar } from "./lumio";
import { LogoutButton } from "./student-logout-button";
import { useStudentProfile } from "./lib/queries";

const MENU = [
  { icon: Wallet, tone: "teal" as const, label: "To'lovlar", href: "/portal/payments" },
  { icon: ChartLineUp, tone: "amber" as const, label: "Davomat", href: "/portal/attendance" },
  { icon: QrCode, tone: "sky" as const, label: "QR skaner", href: "/portal/scan" },
  { icon: Gear, tone: "ink" as const, label: "Sozlamalar", href: "/portal/settings" },
  { icon: Question, tone: "sky" as const, label: "FAQ", href: "/portal/faq" },
  { icon: Info, tone: "grape" as const, label: "Biz haqimizda", href: "/portal/about" },
];

export function StudentMoreHub() {
  const { data: profile } = useStudentProfile();
  const name = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "Profil";

  return (
    <Screen>
      <ScreenHeader title="Ko'proq" />

      <FadeIn index={0}>
        <Link
          href="/portal/profile"
          className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4 shadow-lumio-card transition-colors hover:bg-tint"
        >
          <Avatar src={profile?.photo} name={name} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-xl font-extrabold text-ink-900">
              {name}
            </span>
            <span className="block text-sm font-semibold text-ink-500">
              Profilni ko&apos;rish
            </span>
          </span>
          <CaretRight size={20} weight="bold" className="text-ink-400" />
        </Link>
      </FadeIn>

      <div className="flex flex-col gap-2.5">
        {MENU.map((m, i) => {
          const Icon = m.icon;
          return (
            <FadeIn key={m.label} index={i + 1}>
              <ListRow
                icon={<Icon weight="bold" />}
                iconTone={m.tone}
                label={m.label}
                href={m.href}
              />
            </FadeIn>
          );
        })}
        <FadeIn index={MENU.length + 1}>
          <LogoutButton variant="row" />
        </FadeIn>
      </div>
    </Screen>
  );
}
