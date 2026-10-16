"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  fetchOwnershipRules,
  saveOwnershipRules,
  type OwnershipRules,
} from "@/components/leads/ownership/ownership-api";
import { SettingsPageHeader } from "./settings-page-header";

const FIELDS: {
  key: keyof OwnershipRules;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "maxUntouched",
    label: "Harakatsiz lidlar chegarasi",
    hint: "Bir xodim bir vaqtda nechta hali bog'lanilmagan lidni ushlab tura oladi",
    min: 1,
    max: 100,
  },
  {
    key: "firstActionHours",
    label: "Birinchi harakat (ish soati)",
    hint: "Lid olingandan keyin shuncha ish soati ichida qo'ng'iroq, izoh yoki topshiriq bo'lishi kerak",
    min: 1,
    max: 24,
  },
  {
    key: "followUpDays",
    label: "Keyingi harakat (ish kuni)",
    hint: "Oxirgi harakatdan keyin shuncha ish kunida yangi harakat bo'lmasa, lid umumiy ro'yxatga qaytadi",
    min: 1,
    max: 14,
  },
];

const QUERY_KEY = ["lead-ownership-settings"];

/** CEO-only (ADR-0092): the three numbers of the lead owner's clock. */
export function LeadOwnershipSettingsClient() {
  const queryClient = useQueryClient();
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<OwnershipRules | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchOwnershipRules,
  });

  const save = useMutation({
    mutationFn: saveOwnershipRules,
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Every card's deadline follows the new numbers.
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  const form = draft ?? data ?? null;

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader
          title="Lidlar egaligi"
          description="Lidni band qilish chegarasi va harakat muddatlari"
        />
        <p className="text-sm text-muted-foreground">Sozlamalarni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full max-w-xl" />
      </div>
    );
  }

  const invalid = FIELDS.some(
    (f) => !Number.isInteger(form[f.key]) || form[f.key] < f.min || form[f.key] > f.max,
  );

  return (
    <div>
      <SettingsPageHeader
        title="Lidlar egaligi"
        description="Lidni band qilish chegarasi va harakat muddatlari"
      />
      <div className="max-w-xl space-y-5 rounded-lg border p-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              value={form[f.key]}
              disabled={save.isPending}
              className="max-w-28"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setDraft({ ...form, [f.key]: n });
              }}
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Ish vaqti: dushanba–shanba, 08:00–18:00; bayram kunlari hisoblanmaydi.
          O&apos;zgarish hamma lidning muddatiga darhol ta&apos;sir qiladi.
        </p>
        <Button
          disabled={!draft || invalid || save.isPending}
          onClick={() => draft && save.mutate(draft)}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Saqlash
        </Button>
      </div>
    </div>
  );
}
