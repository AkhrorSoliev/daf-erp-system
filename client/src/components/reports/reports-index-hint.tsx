"use client";

import { BarChart3 } from "lucide-react";
import { useT } from "@/i18n/context";

/** What `/reports` shows on a wide screen: the menu is on the left, so this only points at it. */
export function ReportsIndexHint() {
  const t = useT();
  return (
    <div className="hidden md:flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed text-center p-10">
      <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-base font-medium">{t("Hisobot bo'limini tanlang")}</p>
      <p className="text-sm text-muted-foreground mt-1">
        {t("Chap tarafdagi menyudan kerakli hisobotni oching")}
      </p>
    </div>
  );
}
