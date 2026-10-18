"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { FormError, SettingsCard, SettingsSaveBar, UnitNumberField } from "./settings-form-parts";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { getErrorMessage } from "@/lib/get-error-message";
import api from "@/lib/api";
import {
  draftErrors,
  isDirty,
  isValid,
  normText,
  toDraft,
  toNorma,
  type DafDraft,
  type DafNorma,
} from "./daf-norma-draft";

/** Server: `Company.daf*` ustunlari (dizayn 3.4). */
interface CompanyNorma {
  id: number;
  dafKunlikDaqiqa: number;
  dafKunlikSavol: number;
  dafHaftalikKun: number;
  dafSariqKun: number;
}

const TITLE = "DaF normasi";
const DESCRIPTION =
  "O'quvchi ilovada qancha ishlashi kerak: «DaF ilovasi» bo'limidagi ranglar shu normadan chiqadi";

export function DafNormaSettingsClient() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  // The server writes this with `settings.company` too (`PATCH /company/:id`);
  // the lock keeps the button from ending in a 403.
  const canEdit = useCan("settings.company");
  const companyId = user?.companyId;
  const key = ["company-daf-norma", companyId] as const;

  // Qoralama faqat foydalanuvchi tahrirlagandan keyin paydo bo'ladi; shu
  // paytgacha serverdagi qiymat ko'rsatiladi (pauza blokidagi naqsh).
  const [draft, setDraft] = useState<DafDraft | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<DafNorma>({
    queryKey: key,
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
      return next;
    },
    onSuccess: (saved) => {
      // Saqlangan qiymat avval keshga tushadi: qoralama tozalanganda bir lahza eski qiymat ko'rinmasin.
      queryClient.setQueryData(key, saved);
      setDraft(null);
      // Markaz sahifalari normani o'z javobida oladi — ular ham yangilansin.
      queryClient.invalidateQueries({ queryKey: ["daf-center"] });
      toast.success("Norma saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Normani yuklab bo&apos;lmadi.</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          Qayta urinish
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const errors = draftErrors(form);
  const dirty = isDirty(data, form);
  const locked = !canEdit || save.isPending;
  const set = (k: keyof DafDraft) => (text: string) => setDraft({ ...form, [k]: text });

  return (
    <div>
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />

      <SettingsCard>
        <div className="flex flex-wrap gap-4">
          <UnitNumberField
            id="kunlikDaqiqa"
            label="Kunlik eng kam vaqt"
            unit="daqiqa"
            hint="Faqat o'quv bo'limi sanaladi"
            value={form.kunlikDaqiqa}
            error={errors.kunlikDaqiqa}
            disabled={locked}
            onChange={set("kunlikDaqiqa")}
          />
          <UnitNumberField
            id="kunlikSavol"
            label="Kunlik eng kam savol"
            unit="ta savol"
            hint="Vaqt yoki savol: bittasi yetsa kun faol"
            value={form.kunlikSavol}
            error={errors.kunlikSavol}
            disabled={locked}
            onChange={set("kunlikSavol")}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <UnitNumberField
            id="haftalikKun"
            label="Yashil chegarasi"
            unit="kun"
            hint="7 kundan shuncha faol bo'lsa norma bajarilgan"
            value={form.haftalikKun}
            error={errors.haftalikKun}
            disabled={locked}
            onChange={set("haftalikKun")}
          />
          <UnitNumberField
            id="sariqKun"
            label="Sariq chegarasi"
            unit="kun"
            hint="Shundan kam bo'lsa qizil"
            value={form.sariqKun}
            error={errors.sariqKun}
            disabled={locked}
            onChange={set("sariqKun")}
          />
        </div>

        {errors.order && <FormError>{errors.order}</FormError>}
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
          {normText(form)}
        </p>

        <SettingsSaveBar
          dirty={dirty}
          canSave={dirty && isValid(form)}
          saving={save.isPending}
          onCancel={() => setDraft(null)}
          onSave={() => save.mutate(toNorma(form))}
        />
      </SettingsCard>
    </div>
  );
}
