"use client";

import { useState } from "react";
import { Key, User } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Section,
  Card,
  ListRow,
  ThemeSegmented,
} from "./lumio";
import { StudentPasswordDialog } from "./student-password-dialog";
import { useStudentProfile } from "./lib/queries";
import { settingsHelpItems } from "@/lib/student-nav-items";

// Settings answers "how does the app behave" — theme and security. Everything
// that describes *who the student is* (photo, name, contact details) lives on
// the Profile screen, which this page links to. One field, one place to edit
// it: the photo uploader and the name row that used to sit here are gone.
export function StudentSettingsPage() {
  const { data: profile } = useStudentProfile();
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <Screen narrow>
      <StackHeader title="Sozlamalar" backHref="/portal/more" />

      <Section title="Mavzu">
        <Card pad="sm">
          <ThemeSegmented variant="full" />
        </Card>
      </Section>

      <Section title="Xavfsizlik">
        <ListRow
          icon={<Key weight="bold" />}
          iconTone="amber"
          label="Parolni o'zgartirish"
          subtitle={
            profile?.login
              ? `Login: ${profile.login}`
              : "Hisobingizni himoyalang"
          }
          onClick={() => setPasswordOpen(true)}
        />
      </Section>

      <Section title="Hisob">
        <ListRow
          icon={<User weight="bold" />}
          iconTone="sky"
          label="Profil"
          subtitle="Ism, rasm va aloqa ma'lumotlari"
          href="/portal/profile"
        />
      </Section>

      {/*
        Tablet + desktop only. The rail has no row for FAQ / Biz haqimizda, so
        they hang off Settings there. On mobile the "Ko'proq" hub already lists
        them and a second entry point would just be a duplicate.
      */}
      <Section title="Yordam" className="hidden md:flex">
        {settingsHelpItems.map((item) => {
          const Icon = item.icon;
          return (
            <ListRow
              key={item.url}
              icon={<Icon weight="bold" />}
              iconTone={item.tone}
              label={item.title}
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
