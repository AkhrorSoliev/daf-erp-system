"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodToggle } from "@/components/groups/app-activity/activity-ui";
import { DafQidiruvliSelect } from "./daf-qidiruvli-select";
import { HOLAT_MATNI } from "./holat-badge";
import { STANDART_FILTR, type OquvchilarFiltri } from "./oquvchilar-filtr";
import { HOLATLAR, type Daraja, type Holat, type MarkazFiltrVariantlari } from "./types";

const HAMMASI = "all";

export function DafOquvchilarFilterBar({
  filtr,
  variantlar,
  onChange,
}: {
  filtr: OquvchilarFiltri;
  variantlar: MarkazFiltrVariantlari | undefined;
  onChange: (next: OquvchilarFiltri) => void;
}) {
  // Qidiruv: har tugmada URL yozilmasin — 300 ms kutib, keyin bitta marta.
  const [q, setQ] = useState(filtr.q);
  // `filtr.q` o'zgarishi ikki sababdan bo'ladi: tashqaridan (Tozalash, brauzer
  // orqaga, voronka havolasi) yoki shu komponentning o'z yuborgani qaytib
  // kelgani. Ikkinchisida qayta o'rnatish kerak emas — debounce ishlagandan
  // keyin, URL yangilangunicha yozilgan harfni o'chirib yuborardi.
  const oxirgiYuborilgan = useRef(filtr.q);
  useEffect(() => {
    if (filtr.q !== oxirgiYuborilgan.current) {
      oxirgiYuborilgan.current = filtr.q;
      setQ(filtr.q);
    }
  }, [filtr.q]);
  useEffect(() => {
    if (q === filtr.q) return;
    const t = setTimeout(() => {
      oxirgiYuborilgan.current = q;
      onChange({ ...filtr, q, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [q, filtr, onChange]);

  const oz = (qism: Partial<OquvchilarFiltri>) => onChange({ ...filtr, ...qism, page: 1 });
  const filtrBor =
    filtr.status.length > 0 || filtr.kirgan !== null || filtr.groupId !== null ||
    filtr.teacherId !== null || filtr.level !== null || filtr.q !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodToggle value={filtr.davr} onChange={(davr) => oz({ davr })} />

      <MultiSelectCombobox
        options={HOLATLAR.map((h) => ({ value: h, label: HOLAT_MATNI[h] }))}
        selected={filtr.status}
        onChange={(next) => oz({ status: next as Holat[] })}
        placeholder="Barcha holatlar"
        countSuffix="holat"
        className="w-48"
      />

      <Select value={filtr.kirgan ?? HAMMASI} onValueChange={(v) => oz({ kirgan: v === HAMMASI ? null : (v as "ha" | "yoq") })}>
        <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Kirish: hammasi</SelectItem>
          <SelectItem value="ha">Davrda kirgan</SelectItem>
          <SelectItem value="yoq">Davrda kirmagan</SelectItem>
        </SelectContent>
      </Select>

      <DafQidiruvliSelect
        value={filtr.groupId}
        onChange={(v) => oz({ groupId: v })}
        variantlar={(variantlar?.guruhlar ?? []).map((g) => ({ value: g.id, label: g.nomi }))}
        hammasiMatni="Barcha guruhlar"
        className="w-44"
      />

      <DafQidiruvliSelect
        value={filtr.teacherId === null ? null : String(filtr.teacherId)}
        onChange={(v) => oz({ teacherId: v === null ? null : Number(v) })}
        variantlar={(variantlar?.oqituvchilar ?? []).map((o) => ({ value: String(o.id), label: o.ism }))}
        hammasiMatni="Barcha o'qituvchilar"
        className="w-48"
      />

      <Select value={filtr.level ?? HAMMASI} onValueChange={(v) => oz({ level: v === HAMMASI ? null : (v as Daraja) })}>
        <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Daraja" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Barcha darajalar</SelectItem>
          {(variantlar?.darajalar ?? []).map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        {/* `maxLength` server DTO si bilan bir xil: 100 dan oshsa so'rov 400 bilan rad etiladi. */}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki telefon"
          maxLength={100}
          className="h-9 w-52 pl-8"
        />
      </div>

      {filtrBor && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...STANDART_FILTR, davr: filtr.davr, sort: filtr.sort, dir: filtr.dir })}>
          <X className="mr-1 size-4" /> Tozalash
        </Button>
      )}
    </div>
  );
}
