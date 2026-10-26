"use client";

import { useState } from "react";
import { DeviceMobile, Key, User } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Section,
  ListRow,
  ThemeSegmented,
  LanguagePicker,
} from "./lumio";
import { useT } from "@/i18n/context";
import { StudentPasswordDialog } from "./student-password-dialog";
import { LernenKorinishTanlash } from "./lernen-korinish-tanlash";
import { useStudentProfile } from "./lib/queries";
import { settingsHelpItems } from "@/lib/student-nav-items";

// Settings, top to bottom: the account first (who I am, how I sign in, where I am
// signed in), then how the app looks (theme, language), then how learning
// behaves, then help. Everything that describes *who the student is* (photo,
// name, contact details) is edited on the Profile screen this page links to:
// one field, one place to edit it.
export function StudentSettingsPage() {
  const t = useT();
  const { data: profile } = useStudentProfile();
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <Screen narrow>
      <StackHeader title={t("Sozlamalar")} backHref="/portal/more" />

      <Section title={t("Hisobingiz")}>
        <ListRow
          icon={<User weight="bold" />}
          iconTone="sky"
          label={t("Profil")}
          subtitle={t("Ism, rasm va aloqa ma'lumotlari")}
          href="/portal/profile"
        />
        <ListRow
          icon={<Key weight="bold" />}
          iconTone="amber"
          label={t("Parolni o'zgartirish")}
          subtitle={
            profile?.login
              ? t("Login: {login}", { login: profile.login })
              : t("Hisobingizni himoyalang")
          }
          onClick={() => setPasswordOpen(true)}
        />
        {/* The list of devices and the sign-out of the others live on their own page. */}
        <ListRow
          icon={<DeviceMobile weight="bold" />}
          iconTone="coral"
          label={t("Ulangan qurilmalar")}
          subtitle={t("Boshqa qurilmalardan chiqish")}
          href="/portal/settings/devices"
        />
      </Section>

      <Section title={t("Mavzu")}>
        <ThemeSegmented variant="select" />
      </Section>

      {/* Kept on this device only (cookie): a student has no account language. */}
      <Section title={t("Til")}>
        <LanguagePicker variant="field" />
      </Section>

      <LernenKorinishTanlash />

      {/*
        Every width. On tablet + desktop the rail has no row for FAQ / Biz
        haqimizda, so they hang off Settings; on a phone the "Ko'proq" hub lists
        them too, but that is another screen, so the two never share a viewport.
      */}
      <Section title={t("Yordam")}>
        {settingsHelpItems.map((item) => {
          const Icon = item.icon;
          return (
            <ListRow
              key={item.url}
              icon={<Icon weight="bold" />}
              iconTone={item.tone}
              label={t(item.title)}
              href={item.url}
            />
          );
        })}
      </Section>

      <StudentPasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </Screen>
  );
}
