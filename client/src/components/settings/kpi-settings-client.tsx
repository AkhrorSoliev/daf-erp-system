"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/get-error-message";
import { KPI_SETTINGS_KEY, saveKpiSettings, useKpiSettings } from "@/components/reports/admin-kpi/kpi-queries";
import { switchText } from "@/components/reports/admin-kpi/kpi-format";
import type { KpiRuleMode } from "@/components/reports/admin-kpi/kpi-types";
import { draftError, draftPatch, rangeHint, toDraft, type DraftRule, type KpiDraft } from "./kpi-settings-draft";
import { SettingsPageHeader } from "./settings-page-header";

const RULES = [
  { key: "leadPaid", title: "Lid to'lov qildi", base: "Foiz bazasi — o'quvchining birinchi to'lovi" },
  { key: "promiseKept", title: "Va'da bajarildi", base: "Foiz bazasi — va'da paytidagi qarz" },
] as const;

const TITLE = "KPI sozlamalari";
const DESCRIPTION = "KPI narxlari va hisoblash kaliti";

/** CEO-only (ADR-0094): the switch and the two prices. A price changes only the results after it. */
export function KpiSettingsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useKpiSettings();
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<KpiDraft | null>(null);

  const save = useMutation({
    mutationFn: saveKpiSettings,
    onSuccess: (saved) => {
      // The saved answer goes into the cache first, so clearing the draft never shows the old values.
      queryClient.setQueryData(KPI_SETTINGS_KEY, saved);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Sozlamalarni yuklab bo&apos;lmadi.</p>
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
        <Skeleton className="h-72 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const patch = draftPatch(data, form);
  const invalid = RULES.some((r) => draftError(form[r.key]) !== null);

  return (
    <div>
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
      <div className="max-w-xl space-y-6 rounded-lg border p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="kpi-enabled"
              checked={form.enabled}
              disabled={save.isPending}
              onCheckedChange={(enabled) => setDraft({ ...form, enabled })}
            />
            <Label htmlFor="kpi-enabled">KPI hisoblash</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {switchText(data)}. O&apos;chiq paytda yangi natija yozilmaydi va bu davr keyin to&apos;ldirilmaydi;
            bekor qilish ishlayveradi.
          </p>
          {form.enabled !== data.enabled && (
            <p className="text-xs text-muted-foreground">Saqlaganingizdan keyin kuchga kiradi.</p>
          )}
        </div>

        {RULES.map((r) => (
          <div key={r.key} className="space-y-1.5">
            <Label htmlFor={`${r.key}-value`}>{r.title}</Label>
            <RuleFields
              id={r.key}
              rule={form[r.key]}
              disabled={save.isPending}
              onChange={(rule) => setDraft({ ...form, [r.key]: rule })}
            />
            <p className="text-xs text-muted-foreground">{r.base}</p>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Kuzatuv: natijalar yoziladi, lekin oylikka qo&apos;shilmaydi. Summa natija yozilgan paytdagi narx bilan
          qoladi — narx o&apos;zgarsa faqat keyingi natijalarga ta&apos;sir qiladi.
        </p>
        <Button
          disabled={Object.keys(patch).length === 0 || invalid || save.isPending}
          onClick={() => save.mutate(patch)}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Saqlash
        </Button>
      </div>
    </div>
  );
}

function RuleFields({
  id,
  rule,
  disabled,
  onChange,
}: {
  id: string;
  rule: DraftRule;
  disabled: boolean;
  onChange: (rule: DraftRule) => void;
}) {
  const error = draftError(rule);
  const describedBy = `${id}-hint`;
  const digits = (raw: string) => onChange({ ...rule, text: raw.replace(/\D/g, "") });
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={rule.mode}
        disabled={disabled}
        onValueChange={(mode) => onChange({ ...rule, mode: mode as KpiRuleMode })}
      >
        <SelectTrigger id={`${id}-mode`} className="w-40" aria-label="Hisoblash usuli">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="FIXED">Qat&apos;iy summa</SelectItem>
          <SelectItem value="PERCENT">Foiz</SelectItem>
        </SelectContent>
      </Select>
      {rule.mode === "FIXED" ? (
        <PriceInput
          id={`${id}-value`}
          className="max-w-48"
          value={rule.text}
          disabled={disabled}
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          onChange={(e) => digits(e.target.value)}
        />
      ) : (
        <div className="flex items-center gap-1">
          <Input
            id={`${id}-value`}
            inputMode="numeric"
            className="max-w-24"
            value={rule.text}
            disabled={disabled}
            aria-invalid={error !== null}
            aria-describedby={describedBy}
            onChange={(e) => digits(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      )}
      <p id={describedBy} className={error ? "w-full text-xs text-destructive" : "w-full text-xs text-muted-foreground"}>
        {error ?? rangeHint(rule.mode)}
      </p>
    </div>
  );
}
