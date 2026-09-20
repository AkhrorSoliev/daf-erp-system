"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/get-error-message";
import api from "@/lib/api";

/** Server: `Company.daf*` ustunlari (dizayn 3.4). */
interface DafNorma {
  kunlikDaqiqa: number;
  kunlikSavol: number;
  haftalikKun: number;
  sariqKun: number;
}

interface CompanyNorma {
  id: number;
  dafKunlikDaqiqa: number;
  dafKunlikSavol: number;
  dafHaftalikKun: number;
  dafSariqKun: number;
}

/** DTO chegaralari bilan bir xil — server ham tekshiradi, bu darhol javob uchun. */
const CHEGARA: Record<keyof DafNorma, { min: number; max: number }> = {
  kunlikDaqiqa: { min: 1, max: 1440 },
  kunlikSavol: { min: 1, max: 500 },
  haftalikKun: { min: 1, max: 7 },
  sariqKun: { min: 1, max: 7 },
};

/** Chegaradan chiqqan xabarda qaysi maydon ekanini aytish uchun — `NumberField` labeli bilan bir xil. */
const MAYDON_NOMI: Record<keyof DafNorma, string> = {
  kunlikDaqiqa: "Kunlik eng kam vaqt",
  kunlikSavol: "Kunlik eng kam savol",
  haftalikKun: "Haftada eng kam faol kun",
  sariqKun: "Sariq chegarasi",
};

function NumberField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: keyof DafNorma;
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const { min, max } = CHEGARA[id];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        className="max-w-28"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function DafNormaSettingsClient() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  // Yozish serverda ham faqat CEO (`PATCH /company/:id`) — bu qulf tugmani
  // bosib, keyin 403 olishning oldini oladi.
  const canEdit = !!user?.roles?.some((r) => r.id === 1);
  const companyId = user?.companyId;

  // Qoralama faqat foydalanuvchi tahrirlagandan keyin paydo bo'ladi; shu
  // paytgacha serverdagi qiymat ko'rsatiladi (absence-pause sahifasidagi naqsh).
  const [draft, setDraft] = useState<DafNorma | null>(null);

  const { data, isLoading } = useQuery<DafNorma>({
    queryKey: ["company-daf-norma", companyId],
    enabled: companyId !== undefined,
    queryFn: async () => {
      const res = await api.get<CompanyNorma>(`/company/${companyId}`);
      return {
        kunlikDaqiqa: res.data.dafKunlikDaqiqa,
        kunlikSavol: res.data.dafKunlikSavol,
        haftalikKun: res.data.dafHaftalikKun,
        sariqKun: res.data.dafSariqKun,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (next: DafNorma) => {
      await api.patch(`/company/${companyId}`, {
        dafKunlikDaqiqa: next.kunlikDaqiqa,
        dafKunlikSavol: next.kunlikSavol,
        dafHaftalikKun: next.haftalikKun,
        dafSariqKun: next.sariqKun,
      });
    },
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["company-daf-norma"] });
      // Markaz sahifalari normani o'z javobida oladi — ular ham yangilansin.
      queryClient.invalidateQueries({ queryKey: ["daf-center"] });
      toast.success("Norma saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  const form = draft ?? data ?? null;

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // `.find()` — qaysi maydon chegaradan chiqqanini xabarda aytish uchun (I8
  // kichik tuzatish: avval faqat "qiymat chegaradan tashqarida" deyilardi).
  const chegaradanTashqariMaydon =
    (Object.keys(CHEGARA) as (keyof DafNorma)[]).find(
      (k) => form[k] < CHEGARA[k].min || form[k] > CHEGARA[k].max,
    ) ?? null;
  // Teng bo'lsa sariq oraliq yo'qoladi. Server ham tekshiradi.
  const sariqNotogri = form.sariqKun >= form.haftalikKun;
  const locked = !canEdit || save.isPending;
  const set = (k: keyof DafNorma) => (n: number) => setDraft({ ...form, [k]: n });
  // Sariq oralig'i faqat norma to'g'ri bo'lganda ma'noga ega: sariq yashildan
  // katta bo'lsa `4–3 kun` kabi teskari oraliq chiqardi. Bunday paytda butun
  // tushuntirish o'rniga bitta yo'naltiruvchi qator ko'rsatiladi.
  const sariqOraliq =
    form.sariqKun === form.haftalikKun - 1
      ? `${form.sariqKun} kun`
      : `${form.sariqKun}–${form.haftalikKun - 1} kun`;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="DaF normasi"
        description="O'quvchi ilovada qancha ishlashi kerak — «DaF ilovasi» bo'limidagi ranglar shu normadan chiqadi"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="kunlikDaqiqa"
          label="Kunlik eng kam vaqt (daqiqa)"
          hint="Faqat o'quv bo'limidagi vaqt sanaladi; radio va boshqa bo'limlar kirmaydi"
          value={form.kunlikDaqiqa}
          disabled={locked}
          onChange={set("kunlikDaqiqa")}
        />
        <NumberField
          id="kunlikSavol"
          label="Kunlik eng kam savol"
          hint="Tugatilgan seanslardagi savollar. Vaqt YOKI savol — bittasi yetsa kun faol"
          value={form.kunlikSavol}
          disabled={locked}
          onChange={set("kunlikSavol")}
        />
        <NumberField
          id="haftalikKun"
          label="Haftada eng kam faol kun (yashil)"
          hint="7 kundan nechtasi faol bo'lsa norma bajarilgan hisoblanadi"
          value={form.haftalikKun}
          disabled={locked}
          onChange={set("haftalikKun")}
        />
        <NumberField
          id="sariqKun"
          label="Sariq chegarasi (kun)"
          hint="Shundan kam bo'lsa qizil; yashil chegaradan kichik bo'lishi shart"
          value={form.sariqKun}
          disabled={locked}
          onChange={set("sariqKun")}
        />
      </div>

      {sariqNotogri && (
        <p className="text-sm text-destructive">
          Sariq chegarasi haftalik normadan kichik bo&apos;lishi kerak
        </p>
      )}
      {chegaradanTashqariMaydon && (
        <p className="text-sm text-destructive">
          {MAYDON_NOMI[chegaradanTashqariMaydon]} ruxsat etilgan oraliqdan tashqarida (
          {CHEGARA[chegaradanTashqariMaydon].min}–{CHEGARA[chegaradanTashqariMaydon].max})
        </p>
      )}

      <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
        {sariqNotogri ? (
          <>Sariq chegarasi to&apos;g&apos;rilangach, normaning izohi shu yerda ko&apos;rinadi.</>
        ) : (
          <>
            Hozirgi norma: o&apos;quvchi kuniga kamida <b>{form.kunlikDaqiqa} daqiqa</b> o&apos;quv
            bo&apos;limida ishlashi yoki <b>{form.kunlikSavol} ta</b> savolga javob berishi kerak.
            Haftada shunday <b>{form.haftalikKun} kun</b> bo&apos;lsa — yashil, <b>{sariqOraliq}</b>{" "}
            bo&apos;lsa — sariq, kamroq bo&apos;lsa — qizil. Norma o&apos;zgartirilsa o&apos;tmish ham
            yangi norma bilan hisoblanadi.
          </>
        )}
      </p>

      {canEdit && (
        <div className="flex justify-end">
          <Button
            disabled={locked || sariqNotogri || chegaradanTashqariMaydon !== null || draft === null}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Saqlanmoqda...
              </>
            ) : (
              "Saqlash"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
