"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { tryCopyPendingText } from "@/lib/clipboard";
import { formatNumber, formatPhone } from "@/lib/format-utils";
import type { OquvchilarFiltri } from "./oquvchilar-filtr";
import type { MarkazTelefonlar } from "./types";
import { markazTelefonlarniOl } from "./use-daf-center";

function royxatMatni(t: MarkazTelefonlar): string {
  return t.qatorlar
    .map((q) =>
      [
        q.ism,
        q.guruh ?? "guruhsiz",
        formatPhone(q.telefon),
        q.otaOnaTelefoni ? `ota-onasi: ${formatPhone(q.otaOnaTelefoni)}` : null,
      ]
        .filter(Boolean)
        .join(" — "),
    )
    .join("\n");
}

/**
 * Joriy filtr bo'yicha HAMMA o'quvchi (joriy sahifa emas) — har o'quvchi bir
 * qator: ism, guruh, telefon, ota-ona telefoni (dizayn 6.4). Administrator
 * kimga qo'ng'iroq qilayotganini bilishi kerak, shuning uchun yalang'och
 * raqamlar emas.
 */
export function DafRoyxatNusxalash({ filtr, jami }: { filtr: OquvchilarFiltri; jami: number }) {
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  async function nusxala() {
    setYuklanmoqda(true);
    const royxat = markazTelefonlarniOl(filtr);
    // Safari refuses a clipboard write that starts after an await, so the
    // write starts here, inside the click, and completes when the list arrives.
    const nusxa = await tryCopyPendingText(royxat.then(royxatMatni));
    setYuklanmoqda(false);
    if (nusxa.status === "failed" || nusxa.status === "empty") {
      toast.error("Nusxalab bo'lmadi");
      return;
    }
    if (nusxa.status === "refused") {
      toast.error("Brauzer ro'yxatni nusxalashga ruxsat bermadi — qaytadan urinib ko'ring");
      return;
    }
    const t = await royxat;
    toast.success(
      t.qisqartirildi
        ? `${formatNumber(t.qatorlar.length)} qator nusxalandi — ro'yxat qisqartirildi (jami ${formatNumber(t.jami)})`
        : `${formatNumber(t.qatorlar.length)} qator nusxalandi`,
    );
  }

  return (
    <Button variant="outline" size="sm" disabled={jami === 0 || yuklanmoqda} onClick={nusxala}>
      {yuklanmoqda ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Copy className="mr-1.5 size-4" />}
      Ro&apos;yxatni nusxalash
    </Button>
  );
}
