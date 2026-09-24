"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/get-error-message";
import api from "@/lib/api";

interface AbsencePauseSettings {
  enabled: boolean;
  warnThreshold: number;
  pauseThreshold: number;
  dailyCap: number;
}

/** Raqamli maydon — bo'sh qoldirilsa oxirgi to'g'ri qiymat saqlanadi. */
function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
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

export function AbsencePauseSettingsClient() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  // Yozish serverda ham faqat CEO — bu yerdagi qulf shunchaki tugmani
  // bosib, keyin 403 olishning oldini oladi.
  const canEdit = !!user?.roles?.some((r) => r.name === "CEO");

  // Qoralama faqat foydalanuvchi tahrirlagandan keyin paydo bo'ladi; shu
  // paytgacha serverdagi qiymat ko'rsatiladi. `useEffect` bilan holatni
  // sinxronlash bu yerda kerak emas va u qayta yuklashda foydalanuvchi
  // kiritgan qiymatni jimgina bosib ketardi.
  const [draft, setDraft] = useState<AbsencePauseSettings | null>(null);

  const { data, isLoading } = useQuery<AbsencePauseSettings>({
    queryKey: ["absence-pause-settings"],
    queryFn: async () => {
      const res = await api.get("/absence-pause/settings");
      return res.data as AbsencePauseSettings;
    },
  });

  const save = useMutation({
    mutationFn: async (next: AbsencePauseSettings) => {
      const res = await api.patch("/absence-pause/settings", next);
      return res.data as AbsencePauseSettings;
    },
    onSuccess: () => {
      // Qoralama tozalanadi — endi haqiqat serverdan keladi.
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["absence-pause-settings"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-stats"] });
      toast.success("Saqlandi");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    },
  });

  const form = draft ?? data ?? null;

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Teng bo'lsa ogohlantirish pauza bilan bir kunda ketadi va ma'nosi
  // qolmaydi. Server ham tekshiradi — bu faqat darhol javob berish uchun.
  const thresholdsInvalid = form.warnThreshold >= form.pauseThreshold;
  const locked = !canEdit || save.isPending;

  return (
    <div>
      <SettingsPageHeader
        title="Avtomatik pauza"
        description="Ketma-ket dars qoldirgan o'quvchini tizim o'zi pauzaga o'tkazadi"
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Bu sozlamani faqat rahbar o&apos;zgartira oladi. Sozlama ikkala
          filialga birdek qo&apos;llanadi.
        </p>
      )}

      <div className="space-y-6 rounded-lg border p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="enabled" className="text-base">
              Avtomatik pauza yoqilgan
            </Label>
            <p className="text-sm text-muted-foreground">
              Har kuni kechqurun soat 20:30 da o&apos;sha kuni sababsiz dars
              qoldirgan o&apos;quvchiga Telegram xabar boradi. Ertalab soat
              07:30 da ketma-ket dars qoldirganlar pauzaga o&apos;tkaziladi.
              Pauzadagi o&apos;quvchidan pul yechilmaydi va ustozga oylik
              yozilmaydi.
            </p>
          </div>
          <Switch
            id="enabled"
            checked={form.enabled}
            disabled={locked}
            onCheckedChange={(enabled) => setDraft({ ...form, enabled })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="warnThreshold"
            label="Ogohlantirish"
            hint="Shuncha dars qoldirilganda o'quvchiga Telegram xabar ketadi"
            value={form.warnThreshold}
            min={1}
            max={10}
            disabled={locked}
            onChange={(warnThreshold) => setDraft({ ...form, warnThreshold })}
          />
          <NumberField
            id="pauseThreshold"
            label="Pauza"
            hint="Shuncha dars qoldirilganda o'quvchi pauzaga o'tkaziladi"
            value={form.pauseThreshold}
            min={2}
            max={20}
            disabled={locked}
            onChange={(pauseThreshold) => setDraft({ ...form, pauseThreshold })}
          />
          <NumberField
            id="dailyCap"
            label="Bir kunda ko'pi bilan"
            hint="Shunchadan ko'p nomzod topilsa, hech kim pauza qilinmaydi va sizga xabar keladi"
            value={form.dailyCap}
            min={1}
            max={100}
            disabled={locked}
            onChange={(dailyCap) => setDraft({ ...form, dailyCap })}
          />
        </div>

        {thresholdsInvalid && (
          <p className="text-sm text-destructive">
            Ogohlantirish chegarasi pauza chegarasidan kichik bo&apos;lishi
            kerak — aks holda xabar o&apos;quvchiga pauzadan keyin borardi.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={locked || thresholdsInvalid}
            onClick={() => save.mutate(form)}
          >
            {save.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Saqlash
          </Button>
          <Button variant="outline" asChild>
            <Link href="/outreach?tab=paused">
              <PauseCircle className="mr-2 h-4 w-4" />
              Pauzadagilarni ko&apos;rish
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
