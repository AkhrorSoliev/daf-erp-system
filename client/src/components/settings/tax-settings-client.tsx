"use client";

import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { SettingsPageHeader } from "./settings-page-header";
import { TaxBankTiers } from "./tax-bank-tiers";
import { TaxRateRow } from "./tax-rate-row";
import type { DatedRate, DatedTiers } from "./tax-settings-draft";

const KEY = ["settings", "tax"] as const;
const TITLE = msg("Soliq va komissiyalar");
const DESCRIPTION = msg("To'lov komissiyasi, oylik, aylanma solig'i va bank xarajati stavkalari");
const LOAD_FAILED = msg("Sozlamalarni yuklab bo'lmadi.");
const NOTICE = msg("Avtomatik hisoblanadigan soliqlarni xarajatga qo'lda yozmang — ular sof foydadan o'zi ayriladi.");

type TaxValues = Record<string, DatedRate[] | DatedTiers[]>;
type TaxView = { values: TaxValues; filled: number; total: number };
type SaveVars = { key: string; list: DatedRate[] | DatedTiers[] };

const FEE_ROWS = [
  { key: "fees.app.payme", label: msg("Payme ilovasi orqali") },
  { key: "fees.app.click", label: msg("Click ilovasi orqali") },
  { key: "fees.app.uzum", label: msg("Uzum ilovasi orqali") },
  { key: "fees.integration", label: msg("Integratsiya (ID bilan)") },
  { key: "fees.qr", label: msg("QR-kod") },
] as const;
const PAYROLL_ROWS = [
  { key: "payroll.employeeWithholdingPercent", label: msg("Xodimdan ushlanma") },
  { key: "payroll.employerSocialPercent", label: msg("Korxona ijtimoiy solig'i") },
] as const;
const TURNOVER_ROWS = [{ key: "tax.turnoverPercent", label: msg("Hisob raqamga tushgan puldan") }] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="max-w-2xl space-y-3 rounded-lg border p-4 sm:p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="divide-y">{children}</div>
    </section>
  );
}

/** «Soliq va komissiyalar» (`settings.tax`): sof foydadan ayriladigan stavkalar, oydan kuchga kiradi. */
export function TaxSettingsClient() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<TaxView>("/settings/tax").then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: async ({ key, list }: SaveVars) =>
      (await api.patch<TaxView>("/settings/tax", { values: { [key]: list } })).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved);
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
        <Skeleton className="h-14 w-full max-w-2xl" />
        <Skeleton className="h-56 w-full max-w-2xl" />
        <Skeleton className="h-40 w-full max-w-2xl" />
      </div>
    );
  }

  const thisMonth = tashkentNow().dateStr.slice(0, 7);
  const listOf = (key: string) => (data.values[key] ?? []) as DatedRate[];
  const savingKey = save.isPending ? save.variables?.key : null;
  const rows = (items: readonly { key: string; label: string }[]) =>
    items.map(({ key, label }) => (
      <TaxRateRow
        key={key}
        id={key}
        label={t(label)}
        list={listOf(key)}
        thisMonth={thisMonth}
        saving={savingKey === key}
        busy={save.isPending}
        onSave={(list) => save.mutateAsync({ key, list })}
      />
    ));

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={t(TITLE)}
        description={t(DESCRIPTION)}
        action={
          <Badge variant="outline">
            {t("To'ldirilgan: {filled}/{total}", { filled: data.filled, total: data.total })}
          </Badge>
        }
      />

      <Alert className="max-w-2xl border-yellow-500/40 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-100">
        <AlertTriangle />
        <AlertDescription className="text-current">{t(NOTICE)}</AlertDescription>
      </Alert>

      <Section title={t("To'lov komissiyasi")}>{rows(FEE_ROWS)}</Section>
      <Section title={t("Oylik")}>{rows(PAYROLL_ROWS)}</Section>
      <Section title={t("Aylanma solig'i")}>{rows(TURNOVER_ROWS)}</Section>

      <section className="max-w-2xl space-y-3 rounded-lg border p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">{t("Bank xarajati")}</h3>
          <p className="text-xs text-muted-foreground">{t("Hisob raqamga tushgan puldan")}</p>
        </div>
        <TaxBankTiers
          list={(data.values["bank.turnoverTiers"] ?? []) as DatedTiers[]}
          thisMonth={thisMonth}
          saving={savingKey === "bank.turnoverTiers"}
          busy={save.isPending}
          onSave={(list) => save.mutateAsync({ key: "bank.turnoverTiers", list })}
        />
      </section>
    </div>
  );
}
