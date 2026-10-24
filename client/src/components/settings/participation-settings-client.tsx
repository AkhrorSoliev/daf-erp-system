"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import {
  APP_LEVELS,
  draftError,
  draftPatch,
  isDirty,
  toDraft,
  type ParticipationDraft,
  type ParticipationSettings,
  type ParticipationSettingsPatch,
} from "./participation-settings-draft";
import { SettingsPageHeader } from "./settings-page-header";
import { FormError, SettingsCard, SettingsSaveBar, UnitNumberField } from "./settings-form-parts";

const KEY = ["participation-certificates", "settings"] as const;
const TITLE = msg("Qatnashganlik hujjati");
const DESCRIPTION = msg("Hujjat berish uchun davomat, darslar soni, kech qolish va ilova chegaralari");
// JS strings, not JSX text: a JSX chunk with an entity AND a line break loses the space before the break (SWC bug, Next 16.2).
const LOAD_FAILED = msg("Sozlamalarni yuklab bo'lmadi.");
const APP_HINT = msg(
  "Ochiq darslarning shuncha foizi tugatilgan bo'lishi kerak. Kontenti yo'q darajada (A2, B1 hozircha) qo'llanmaydi.",
);

/** CEO-only (spec 2026-10-17): the attendance threshold, the fewest lessons, the lateness limit and the app threshold of A1, A2 and B1. */
export function ParticipationSettingsClient() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ParticipationSettings>("/participation-certificates/settings").then((r) => r.data),
  });
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<ParticipationDraft | null>(null);

  const save = useMutation({
    mutationFn: async (patch: ParticipationSettingsPatch) =>
      (await api.patch<ParticipationSettings>("/participation-certificates/settings", patch)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["participation-certificates", "preview"] });
      toast.success(t("Saqlandi"));
    },
    onError: (err) => toast.error(getErrorMessage(err, t("Saqlashda xatolik"))),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
        <p className="text-sm text-muted-foreground">{t(LOAD_FAILED)}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          {t("Qayta urinish")}
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const dirty = isDirty(data, form);
  const error = dirty ? draftError(form, t) : null;
  const patch = dirty && !error ? draftPatch(data, form) : null;
  const set = (key: keyof ParticipationDraft) => (value: string) => setDraft({ ...form, [key]: value });

  return (
    <div>
      <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />

      <SettingsCard>
        <div className="flex flex-wrap gap-4">
          <UnitNumberField
            id="attendance"
            label={t("Davomat")}
            unit={t("% dan kam bo'lmasin")}
            hint={t("Kelgan va kech kelgan darslar ulushi")}
            value={form.attendance}
            onChange={set("attendance")}
          />
          <UnitNumberField
            id="min-lessons"
            label={t("Eng kam dars soni")}
            unit={t("ta dars")}
            hint={t("Kelgan va kelmagan darslar soni")}
            value={form.minLessons}
            onChange={set("minLessons")}
          />
        </div>
        <UnitNumberField
          id="max-late"
          label={t("Kech qolish")}
          unit={t("% dan oshmasin")}
          hint={t("Kelgan darslarga nisbatan; 0 bo'lsa bitta kech qolish ham to'sadi")}
          className="max-w-xs"
          value={form.maxLate}
          onChange={set("maxLate")}
        />

        <div className="space-y-3 border-t pt-5">
          <div>
            <h3 className="text-sm font-semibold">{t("Ilova chegarasi")}</h3>
            <p className="text-xs text-muted-foreground">{t(APP_HINT)}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {APP_LEVELS.map((level) => (
              <UnitNumberField
                key={level}
                id={`app-${level}`}
                label={level}
                unit="%"
                value={form[level]}
                onChange={set(level)}
              />
            ))}
          </div>
        </div>

        {error && <FormError>{error}</FormError>}

        <SettingsSaveBar
          dirty={dirty}
          canSave={patch !== null}
          saving={save.isPending}
          onCancel={() => setDraft(null)}
          onSave={() => patch && save.mutate(patch)}
        />
      </SettingsCard>
    </div>
  );
}
