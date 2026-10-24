"use client";

import { AlertCircle } from "lucide-react";
import { useT } from "@/i18n/use-t";

export default function ReceiptNotFound() {
  const t = useT();
  return (
    <div className="rounded-lg border bg-background shadow-sm p-6 text-center space-y-3">
      <div className="flex justify-center">
        <AlertCircle className="size-10 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold">{t("Hujjat topilmadi")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("Tekshirilayotgan kvitansiya identifikatori noto'g'ri yoki hujjat o'chirib tashlangan bo'lishi mumkin.")}
      </p>
    </div>
  );
}
