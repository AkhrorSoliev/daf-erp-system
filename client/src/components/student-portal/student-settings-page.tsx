"use client";

import { useState } from "react";
import { Key, SignOut, User } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Section,
  Card,
  ListRow,
  ThemeSegmented,
  LanguagePicker,
} from "./lumio";
import { useT } from "@/i18n/context";
import { StudentPasswordDialog } from "./student-password-dialog";
import { LogoutOthersDialog } from "@/components/shared/logout-others-dialog";
import { useStudentProfile } from "./lib/queries";
import { settingsHelpItems } from "@/lib/student-nav-items";

// Settings answers "how does the app behave" — theme and security. Everything
// that describes *who the student is* (photo, name, contact details) lives on
// the Profile screen, which this page links to. One field, one place to edit
// it: the photo uploader and the name row that used to sit here are gone.
export function StudentSettingsPage() {
  const t = useT();
  const { data: profile } = useStudentProfile();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);

  return (
    <Screen narrow>
      <StackHeader title={t("Sozlamalar")} backHref="/portal/more" />

      <Section title={t("Mavzu")}>
        <Card pad="sm">
          <ThemeSegmented variant="full" />
        </Card>
      </Section>

      {/* Kept on this device only (cookie): a student has no account language. */}
      <Section title={t("Til")}>
        <Card pad="sm">
          <LanguagePicker />
        </Card>
      </Section>

      <Section title={t("Xavfsizlik")}>
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
        {/* No chevron: this row confirms an action, like the portal's own
            sign-out row, and the full label only fits a phone without it. */}
        <ListRow
          icon={<SignOut weight="bold" />}
          iconTone="coral"
          label={t("Boshqa qurilmalardan chiqish")}
          subtitle={t("Bu qurilmada qolasiz")}
          chevron={false}
          onClick={() => setLogoutOthersOpen(true)}
        />
      </Section>

      <Section title={t("Hisobingiz")}>
        <ListRow
          icon={<User weight="bold" />}
          iconTone="sky"
          label={t("Profil")}
          subtitle={t("Ism, rasm va aloqa ma'lumotlari")}
          href="/portal/profile"
        />
      </Section>

      {/*
        Tablet + desktop only. The rail has no row for FAQ / Biz haqimizda, so
        they hang off Settings there. On mobile the "Ko'proq" hub already lists
        them and a second entry point would just be a duplicate.
      */}
      <Section title={t("Yordam")} className="hidden md:flex">
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
      <LogoutOthersDialog
        open={logoutOthersOpen}
        onOpenChange={setLogoutOthersOpen}
        contentClassName="lumio"
      />
    </Screen>
  );
}
