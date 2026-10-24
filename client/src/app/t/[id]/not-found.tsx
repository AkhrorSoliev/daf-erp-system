"use client";

import { XCircle } from "lucide-react";
import { useT } from "@/i18n/use-t";

export default function CertificateNotFound() {
  const t = useT();
  return (
    <div className="rounded-lg border bg-background p-6 text-center shadow-sm">
      <XCircle className="mx-auto mb-3 size-8 text-red-600" />
      <p className="font-semibold">{t("Hujjat topilmadi")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Havola noto'g'ri yoki hujjat bizning tizimda berilmagan.")}
      </p>
    </div>
  );
}
