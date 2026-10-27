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
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { KPI_SETTINGS_KEY, saveKpiSettings, useKpiSettings } from "@/components/reports/admin-kpi/kpi-queries";
import { RESULT_TYPE_LABEL, switchText } from "@/components/reports/admin-kpi/kpi-format";
import type { KpiRuleMode } from "@/components/reports/admin-kpi/kpi-types";
import { draftError, draftPatch, rangeHint, toDraft, type DraftRule, type KpiDraft } from "./kpi-settings-draft";
import { SettingsPageHeader } from "./settings-page-header";

const RULES = [
  { key: "leadPaid", title: RESULT_TYPE_LABEL.LEAD_PAID, base: msg("Foiz bazasi — o'quvchining birinchi to'lovi") },
  { key: "promiseKept", title: RESULT_TYPE_LABEL.PROMISE_KEPT, base: msg("Foiz bazasi — va'da paytidagi qarz") },
] as const;

const TITLE = msg("KPI sozlamalari");
const DESCRIPTION = msg("KPI narxlari va hisoblash kaliti");

/** CEO-only (ADR-0096): the switch and the two prices. A price changes only the results after it. */
export function KpiSettingsClient() {
  const t = useT();
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
      toast.success(t("Saqlandi"));
    },
    onError: (err) => toast.error(getErrorMessage(err, t("Saqlashda xatolik"))),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
        <p className="text-sm text-muted-foreground">{t("Sozlamalarni yuklab bo'lmadi.")}</p>
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
        <Skeleton className="mx-auto h-72 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const patch = draftPatch(data, form);
  const invalid = RULES.some((r) => draftError(form[r.key]) !== null);

  return (
    <div>
      <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
      <div className="mx-auto max-w-xl space-y-6 rounded-lg border p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="kpi-enabled"
              checked={form.enabled}
              disabled={save.isPending}
              onCheckedChange={(enabled) => setDraft({ ...form, enabled })}
            />
            <Label htmlFor="kpi-enabled">{t("KPI hisoblash")}</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("{state}. O'chiq paytda yangi natija yozilmaydi va bu davr keyin to'ldirilmaydi; bekor qilish ishlayveradi.", {
              state: switchText(data, t),
            })}
          </p>
          {form.enabled !== data.enabled && (
            <p className="text-xs text-muted-foreground">{t("Saqlaganingizdan keyin kuchga kiradi.")}</p>
          )}
        </div>

        {RULES.map((r) => {
          const { title, base } = r;
          return (
            <div key={r.key} className="space-y-1.5">
              <Label htmlFor={`${r.key}-value`}>{t(title)}</Label>
              <RuleFields
                id={r.key}
                rule={form[r.key]}
                disabled={save.isPending}
                onChange={(rule) => setDraft({ ...form, [r.key]: rule })}
              />
              <p className="text-xs text-muted-foreground">{t(base)}</p>
            </div>
          );
        })}

        <p className="text-xs text-muted-foreground">
          {t("Kuzatuv: natijalar yoziladi, lekin oylikka qo'shilmaydi. Summa natija yozilgan paytdagi narx bilan qoladi — narx o'zgarsa faqat keyingi natijalarga ta'sir qiladi.")}
        </p>
        <Button
          disabled={Object.keys(patch).length === 0 || invalid || save.isPending}
          onClick={() => save.mutate(patch)}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("Saqlash")}
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
  const t = useT();
  const error = draftError(rule, t);
  const describedBy = `${id}-hint`;
  const digits = (raw: string) => onChange({ ...rule, text: raw.replace(/\D/g, "") });
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={rule.mode}
        disabled={disabled}
        onValueChange={(mode) => onChange({ ...rule, mode: mode as KpiRuleMode })}
      >
        <SelectTrigger id={`${id}-mode`} className="w-40" aria-label={t("Hisoblash usuli")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="FIXED">{t("Qat'iy summa")}</SelectItem>
          <SelectItem value="PERCENT">{t("Foiz")}</SelectItem>
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
        {error ?? rangeHint(rule.mode, t)}
      </p>
    </div>
  );
}
