"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { History, Loader2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { FormError, SettingsCard, SettingsSaveBar, UnitNumberField } from "./settings-form-parts";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import {
  buildPatch,
  candidatesText,
  draftErrors,
  isDirty,
  isValid,
  previewThreshold,
  summaryText,
  toDraft,
  type AbsencePauseDraft,
  type AbsencePauseSettings,
} from "./absence-pause-draft";
import { lastChangeText } from "./absence-pause-history";
import {
  AbsencePauseHistorySheet,
  HISTORY_KEY,
  useAbsencePauseHistory,
} from "./absence-pause-history-sheet";

const SETTINGS_KEY = ["absence-pause-settings"] as const;

function CandidatesNote({
  saved,
  draft,
}: {
  saved: AbsencePauseSettings;
  draft: AbsencePauseDraft;
}) {
  const t = useT();
  const threshold = previewThreshold(saved, draft);
  const { data, isLoading } = useQuery({
    queryKey: ["absence-pause", "preview", threshold],
    enabled: threshold !== null,
    queryFn: () =>
      api
        .get<{ candidates: number }>("/absence-pause/preview", {
          params: { pauseThreshold: threshold },
        })
        .then((r) => r.data),
  });
  if (threshold === null) return null;
  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("Nomzodlar hisoblanmoqda...")}</p>;
  }
  const cap = isValid(draft) ? Number(draft.cap) : saved.dailyCap;
  const note = candidatesText(data.candidates, threshold, cap, t);
  return (
    <div
      role="status"
      className={
        note.tone === "warning"
          ? "rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-sm leading-relaxed text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-100"
          : "rounded-md border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed"
      }
    >
      {note.text}
      {data.candidates > 0 && (
        <>
          {" "}
          <Link href="/outreach" className="underline underline-offset-2">
            {t("Ro'yxatni ko'rish")}
          </Link>
        </>
      )}
    </div>
  );
}

export function AbsencePauseSettingsClient() {
  const t = useT();
  const queryClient = useQueryClient();
  // The server writes this with `settings.company` too; the lock keeps the
  // button from ending in a 403. The note below waits for the list, so it
  // never flashes at someone who can edit.
  const canEdit = useCan("settings.company");
  const permissionsReady = usePermissionsReady();

  // Qoralama faqat foydalanuvchi tahrirlagandan keyin paydo bo'ladi; shu
  // paytgacha serverdagi qiymat ko'rsatiladi. `useEffect` bilan holatni
  // sinxronlash bu yerda kerak emas va u qayta yuklashda foydalanuvchi
  // kiritgan qiymatni jimgina bosib ketardi.
  const [draft, setDraft] = useState<AbsencePauseDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AbsencePauseSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const res = await api.get("/absence-pause/settings");
      return res.data as AbsencePauseSettings;
    },
  });

  // Oxirgi o'zgarish: tarixning birinchi qatori (panel ham shu javobni ishlatadi).
  const last = useAbsencePauseHistory(1, 1);

  const save = useMutation({
    mutationFn: async (patch: Partial<AbsencePauseSettings>) => {
      const res = await api.patch("/absence-pause/settings", patch);
      return res.data as AbsencePauseSettings;
    },
    onSuccess: (saved) => {
      // Saqlangan javob avval keshga tushadi, keyin qoralama tozalanadi:
      // aks holda bir lahza eski qiymat ko'rinardi.
      queryClient.setQueryData(SETTINGS_KEY, saved);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
      queryClient.invalidateQueries({ queryKey: ["absence-pause", "preview"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-stats"] });
      toast.success(t("Saqlandi"));
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik")));
    },
  });

  const header = (
    <SettingsPageHeader
      title={t("Avtomatik pauza")}
      description={t("Ketma-ket dars qoldirgan o'quvchini tizim o'zi pauzaga o'tkazadi")}
      action={
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="mr-1.5 size-4" />
          {t("Tarix")}
        </Button>
      }
    />
  );

  if (isError) {
    return (
      <div className="space-y-3">
        {header}
        <p className="text-sm text-muted-foreground">{t("Sozlamani yuklab bo'lmadi.")}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          {t("Qayta urinish")}
        </Button>
        <AbsencePauseHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const errors = draftErrors(form, t);
  const dirty = isDirty(data, form);
  const patch = buildPatch(data, form);
  const canSave = dirty && isValid(form) && Object.keys(patch).length > 0 && !save.isPending;
  const locked = !canEdit || save.isPending;
  const set = (key: keyof AbsencePauseDraft, value: string | boolean) =>
    setDraft({ ...form, [key]: value });
  const summary = summaryText(form, t);
  const lastEntry = last.data?.data[0];

  return (
    <div>
      {header}

      {permissionsReady && !canEdit && (
        <p className="mb-4 max-w-xl rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("Bu sozlamani faqat CEO o'zgartira oladi. Sozlama barcha filiallarga birdek qo'llanadi.")}
        </p>
      )}

      <SettingsCard>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="enabled" className="text-base">
              {t("Qoidani yoqish")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {last.isLoading
                ? t("Yuklanmoqda...")
                : lastEntry
                  ? t("Oxirgi o'zgarish: {change}", { change: lastChangeText(lastEntry, t) })
                  : t("Hali o'zgartirilmagan")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={
                data.enabled
                  ? "rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              }
            >
              {data.enabled ? t("Yoqilgan") : t("O'chiq")}
            </span>
            <Switch
              id="enabled"
              checked={form.enabled}
              disabled={locked}
              onCheckedChange={(enabled) => set("enabled", enabled)}
            />
          </div>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("20:30 da o'sha kuni sababsiz qoldirgan o'quvchiga Telegram xabar boradi")}</li>
          <li>{t("07:30 da ketma-ket qoldirganlar pauzaga o'tkaziladi")}</li>
          <li>{t("Pauzadagi o'quvchidan pul yechilmaydi, ustozga oylik yozilmaydi")}</li>
        </ul>

        <CandidatesNote saved={data} draft={form} />

        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">{t("Chegaralar")}</h3>
          <div className="flex flex-wrap gap-4">
            <UnitNumberField
              id="warn"
              label={t("Xabar")}
              unit={t("ta dars")}
              value={form.warn}
              error={errors.warn}
              disabled={locked}
              onChange={(v) => set("warn", v)}
            />
            <UnitNumberField
              id="pause"
              label={t("Pauzaga o'tkazish")}
              unit={t("ta dars")}
              value={form.pause}
              error={errors.pause}
              disabled={locked}
              onChange={(v) => set("pause", v)}
            />
            <UnitNumberField
              id="cap"
              label={t("Kuniga ko'pi bilan")}
              unit={t("nafar")}
              value={form.cap}
              error={errors.cap}
              disabled={locked}
              onChange={(v) => set("cap", v)}
            />
          </div>
          {errors.order ? (
            <FormError>{errors.order}</FormError>
          ) : (
            summary && (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {summary}
              </p>
            )
          )}
          <p className="text-xs text-muted-foreground">
            {t("Bir kunda belgilangandan ko'p nomzod chiqsa, hech kim pauzalanmaydi va sizga xabar keladi.")}
          </p>
        </div>

        <SettingsSaveBar
          dirty={dirty}
          canSave={canSave}
          saving={save.isPending}
          onCancel={() => setDraft(null)}
          onSave={() => save.mutate(patch)}
        />
      </SettingsCard>

      <Button variant="link" asChild className="mt-3 h-auto px-0">
        <Link href="/outreach?tab=paused">
          <PauseCircle className="mr-1.5 size-4" />
          {t("Pauzadagilarni ko'rish")}
        </Link>
      </Button>

      <AbsencePauseHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
