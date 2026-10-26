"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { featureEnabled, moreNavItems } from "@/lib/student-nav-items";
import { useChatEnabled } from "./chat/chat-queries";
import { Screen, ScreenHeader, FadeIn, ListRow, Avatar, Section } from "./lumio";
import { LogoutButton } from "./student-logout-button";
import { useStudentProfile } from "./lib/queries";
import { useT } from "@/i18n/context";

type HubItem = (typeof moreNavItems)[number];

function HubRow({ item, t }: { item: HubItem; t: (text: string) => string }) {
  const Icon = item.icon;
  return (
    <ListRow
      icon={<Icon weight="bold" />}
      iconTone={item.tone}
      label={t(item.title)}
      href={item.url}
    />
  );
}

// The rows come from the nav config, never from a list kept here: a copy of
// its own is how this hub once missed Ta'lim while listing To'lovlar twice.
export function StudentMoreHub() {
  const t = useT();
  const { data: profile } = useStudentProfile();
  const features = { chat: useChatEnabled() };
  const items = moreNavItems.filter((i) => featureEnabled(i, features));
  const mainItems = items.filter((i) => i.slot !== "help");
  const helpItems = items.filter((i) => i.slot === "help");

  const name = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : t("Profil");

  return (
    <Screen>
      <ScreenHeader title={t("Ko'proq")} />

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
              {t("Profilni ko'rish")}
            </span>
          </span>
          <CaretRight size={20} weight="bold" className="text-ink-400" />
        </Link>
      </FadeIn>

      {/* Top to bottom: what the student uses, then help, then sign-out on its own. */}
      <div className="flex flex-col gap-2.5">
        {mainItems.map((item, i) => (
          <FadeIn key={item.url} index={i + 1}>
            <HubRow item={item} t={t} />
          </FadeIn>
        ))}
      </div>

      <Section title={t("Yordam")}>
        {helpItems.map((item, i) => (
          <FadeIn key={item.url} index={mainItems.length + i + 1}>
            <HubRow item={item} t={t} />
          </FadeIn>
        ))}
      </Section>

      <FadeIn index={items.length + 1}>
        <LogoutButton variant="row" />
      </FadeIn>
    </Screen>
  );
}
