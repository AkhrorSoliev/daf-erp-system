"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { moreNavItems } from "@/lib/student-nav-items";
import { Screen, ScreenHeader, FadeIn, ListRow, Avatar } from "./lumio";
import { LogoutButton } from "./student-logout-button";
import { useStudentProfile } from "./lib/queries";

// The rows come from the nav config, never from a list kept here: a copy of
// its own is how this hub once missed Ta'lim while listing To'lovlar twice.
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
        {moreNavItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <FadeIn key={item.url} index={i + 1}>
              <ListRow
                icon={<Icon weight="bold" />}
                iconTone={item.tone}
                label={item.title}
                href={item.url}
              />
            </FadeIn>
          );
        })}
        <FadeIn index={moreNavItems.length + 1}>
          <LogoutButton variant="row" />
        </FadeIn>
      </div>
    </Screen>
  );
}
