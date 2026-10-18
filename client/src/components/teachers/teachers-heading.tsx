"use client";

import { useT } from "@/i18n/context";

/** The teachers page title in the page language. */
export function TeachersHeading() {
  const t = useT();
  return (
    <div>
      <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
        {t("O'qituvchilar")}
      </h1>
      <p className="text-muted-foreground">{t("Barcha o'qituvchilar ro'yxati")}</p>
    </div>
  );
}
