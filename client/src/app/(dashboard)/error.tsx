"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

/**
 * A page that crashes inside the dashboard. It is caught here, below the
 * dashboard layout, so the header and the teacher's bottom bar stay and the
 * user can leave the broken page. The root `error.tsx` replaces the whole
 * screen and keeps only a «Bosh sahifa» link.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="bg-destructive/10 rounded-full p-4">
        <TriangleAlert className="text-destructive size-8" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">{t("Sahifani ochib bo'lmadi")}</h1>
      <p className="text-muted-foreground text-sm">
        {t("Nimadir noto'g'ri ketdi. Qayta urinib ko'ring yoki boshqa bo'limga o'ting.")}
      </p>
      <Button variant="outline" onClick={reset}>
        <RefreshCw className="mr-1.5 size-4" />
        {t("Qayta urinish")}
      </Button>
    </div>
  );
}
