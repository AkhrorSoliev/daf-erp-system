"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { TaxPastMonthConfirm } from "./tax-past-month-confirm";
import {
  percentInput,
  percentText,
  tiersError,
  toTierPayload,
  type DatedTiers,
  type TierRow,
} from "./tax-settings-draft";

const digits = (raw: string) => raw.replace(/\D/g, "");

/** Amalda turgan (yoki oxirgi) oraliqlar — yangi shaklning boshlang'ich qiymati. */
function startRows(list: DatedTiers[], thisMonth: string): TierRow[] {
  const inForce = [...list].reverse().find((r) => r.fromMonth <= thisMonth) ?? list[list.length - 1];
  if (!inForce) return [{ fromAmount: "0", toAmount: "", percent: "" }];
  return inForce.tiers.map((x) => ({
    fromAmount: String(x.fromAmount),
    toAmount: x.toAmount === null ? "" : String(x.toAmount),
    percent: String(x.percent),
  }));
}

/** «Bank xarajati»: oylik aylanma tushgan oraliqning foizi butun aylanmaga qo'llanadi. */
export function TaxBankTiers({
  list,
  thisMonth,
  saving,
  onSave,
}: {
  list: DatedTiers[];
  thisMonth: string;
  saving: boolean;
  onSave: (fullList: DatedTiers[]) => Promise<unknown>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<TierRow[]>(() => startRows(list, thisMonth));
  const [askMonth, setAskMonth] = useState<string | null>(null);

  const error = tiersError(rows);
  const monthOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const canSave = error === null && monthOk;

  const patchRow = (i: number, patch: Partial<TierRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // «Gacha» o'zgarsa keyingi oraliqning «Dan» qiymati o'zi ergashadi: bo'shliq chiqmasin.
  const setTo = (i: number, to: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, toAmount: to } : j === i + 1 ? { ...r, fromAmount: to } : r)));

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows([...rows, { fromAmount: last.toAmount, toAmount: "", percent: "" }]);
  };

  const removeRow = (i: number) => {
    const rest = rows.filter((_, j) => j !== i);
    // O'chirilgan oraliqdan oldingisi uning chegarasini oladi — jadval uzluksiz qoladi.
    if (i > 0 && i < rows.length) rest[i - 1] = { ...rest[i - 1], toAmount: rows[i].toAmount };
    if (i === 0 && rest[0]) rest[0] = { ...rest[0], fromAmount: "0" };
    setRows(rest);
  };

  const send = () => {
    const row = toTierPayload(month, rows);
    const full = [...list.filter((r) => r.fromMonth !== month), row].sort((a, b) =>
      a.fromMonth.localeCompare(b.fromMonth),
    );
    void onSave(full).then(
      () => setOpen(false),
      () => undefined,
    );
  };

  const submit = () => {
    if (!canSave) return;
    if (month < thisMonth) setAskMonth(month);
    else send();
  };

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <div className="text-sm text-yellow-700 dark:text-yellow-300">{t("kiritilmagan")}</div>
      ) : (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {list.map((r) => (
            <li key={r.fromMonth}>
              <span className="font-medium text-foreground">{t("{oy} dan —", { oy: r.fromMonth })}</span>{" "}
              {r.tiers
                .map(
                  (x) =>
                    `${formatNumber(x.fromAmount)}${x.toAmount === null ? "+" : `–${formatNumber(x.toAmount)}`}: ${percentText(x.percent)}`,
                )
                .join(" · ")}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Oylik aylanma tushgan oraliqning foizi butun aylanmaga qo'llanadi.")}
      </p>

      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("O'zgartirish")}
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="bank-month">{t("Qaysi oydan")}</Label>
            <Input
              id="bank-month"
              type="month"
              className="w-40"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 pr-2 font-medium">{t("Dan")}</th>
                  <th className="pb-1 pr-2 font-medium">{t("Gacha (bo'sh = cheksiz)")}</th>
                  <th className="pb-1 pr-2 font-medium">{t("Foiz")}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isLast = i === rows.length - 1;
                  return (
                    <tr key={i}>
                      <td className="pb-2 pr-2">
                        <Input
                          inputMode="numeric"
                          aria-label={t("Dan")}
                          className="w-32"
                          value={r.fromAmount}
                          disabled={i > 0}
                          onChange={(e) => patchRow(i, { fromAmount: digits(e.target.value) })}
                        />
                      </td>
                      <td className="pb-2 pr-2">
                        <Input
                          inputMode="numeric"
                          aria-label={t("Gacha (bo'sh = cheksiz)")}
                          className="w-32"
                          value={r.toAmount}
                          placeholder={isLast ? "∞" : ""}
                          onChange={(e) => setTo(i, digits(e.target.value))}
                        />
                      </td>
                      <td className="pb-2 pr-2">
                        <Input
                          inputMode="decimal"
                          aria-label={t("Foiz")}
                          className="w-20 text-center"
                          value={r.percent}
                          onChange={(e) => patchRow(i, { percent: percentInput(e.target.value) })}
                        />
                      </td>
                      <td className="pb-2">
                        {rows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRow(i)}
                            aria-label={t("Oraliqni o'chirish")}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button variant="outline" size="sm" onClick={addRow} disabled={rows[rows.length - 1].toAmount.trim() === ""}>
            <Plus className="mr-1.5 size-4" />
            {t("Oraliq qo'shish")}
          </Button>
          {rows[rows.length - 1].toAmount.trim() === "" && (
            <p className="text-xs text-muted-foreground">
              {t("Oraliq qo'shish uchun avval oxirgi oraliqning «Gacha» qiymatini yozing.")}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{t(error)}</p>}
          {!monthOk && <p className="text-sm text-destructive">{t("Oyni tanlang")}</p>}

          <div className="flex gap-2">
            <Button size="sm" disabled={!canSave || saving} onClick={submit}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("Saqlash")}
            </Button>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>
              {t("Bekor qilish")}
            </Button>
          </div>
        </div>
      )}

      <TaxPastMonthConfirm
        month={askMonth}
        onCancel={() => setAskMonth(null)}
        onConfirm={() => {
          setAskMonth(null);
          send();
        }}
      />
    </div>
  );
}
