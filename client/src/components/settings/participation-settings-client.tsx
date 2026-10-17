"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  APP_LEVELS,
  draftError,
  draftPatch,
  toDraft,
  type ParticipationDraft,
  type ParticipationSettings,
  type ParticipationSettingsPatch,
} from "./participation-settings-draft";
import { SettingsPageHeader } from "./settings-page-header";

const KEY = ["participation-certificates", "settings"] as const;
const TITLE = "Qatnashganlik hujjati";
const DESCRIPTION = "Hujjat berish uchun davomat va ilova chegarasi";
// JS strings, not JSX text: a JSX chunk with an entity AND a line break loses the space before the break (SWC bug, Next 16.2).
const LOAD_FAILED = "Sozlamalarni yuklab bo'lmadi.";
const ATTENDANCE_HINT =
  "Kelgan va kech kelgan darslar ulushi shundan kam bo'lsa, hujjat berilmaydi. Sababli kelmagan va bekor bo'lgan darslar hisobga kirmaydi.";
const APP_HINT =
  "O'quvchi darajaning hujjat berilgan kunda ochiq darslaridan shuncha foizini tugatgan bo'lishi kerak. Kontenti yo'q darajalarda (A2, B1 hozircha) bu shart qo'llanmaydi.";

/** CEO-only (spec 2026-10-17): one attendance threshold, and the app threshold of A1, A2 and B1. */
export function ParticipationSettingsClient() {
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
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">{LOAD_FAILED}</p>
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
        <Skeleton className="h-56 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const error = draft ? draftError(form) : null;
  const patch = draft && !error ? draftPatch(data, form) : null;
  const set = (key: keyof ParticipationDraft, value: string) => setDraft({ ...form, [key]: value });

  return (
    <div className="max-w-xl space-y-6">
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />

      <section className="space-y-2">
        <Label htmlFor="attendance">Davomat chegarasi, %</Label>
        <Input
          id="attendance"
          inputMode="numeric"
          value={form.attendance}
          onChange={(e) => set("attendance", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{ATTENDANCE_HINT}</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Ilova chegarasi, %</h3>
        <p className="text-xs text-muted-foreground">{APP_HINT}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {APP_LEVELS.map((level) => (
            <div key={level} className="space-y-1">
              <Label htmlFor={`app-${level}`}>{level}</Label>
              <Input
                id={`app-${level}`}
                inputMode="numeric"
                value={form[level]}
                onChange={(e) => set(level, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <Button disabled={!patch || save.isPending} onClick={() => patch && save.mutate(patch)}>
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Saqlash
      </Button>
    </div>
  );
}
