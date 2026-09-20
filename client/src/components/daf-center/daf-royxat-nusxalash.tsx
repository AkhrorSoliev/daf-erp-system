"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format-utils";
import type { OquvchilarFiltri } from "./oquvchilar-filtr";
import { markazTelefonlarniOl } from "./use-daf-center";

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
    try {
      const t = await markazTelefonlarniOl(filtr);
      const matn = t.qatorlar
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
      await navigator.clipboard.writeText(matn);
      toast.success(
        t.qisqartirildi
          ? `${t.qatorlar.length} qator nusxalandi — ro'yxat qisqartirildi (jami ${t.jami})`
          : `${t.qatorlar.length} qator nusxalandi`,
      );
    } catch {
      toast.error("Nusxalab bo'lmadi");
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={jami === 0 || yuklanmoqda} onClick={nusxala}>
      {yuklanmoqda ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Copy className="mr-1.5 size-4" />}
      Ro&apos;yxatni nusxalash
    </Button>
  );
}
