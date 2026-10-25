"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/context";
import { TaxPastMonthConfirm } from "./tax-past-month-confirm";
import {
  currentRate,
  mergeRateRow,
  percentInput,
  percentText,
  rowError,
  toRatePayload,
  type DatedRate,
} from "./tax-settings-draft";

/**
 * Bitta stavka: hozirgi qiymat, tarix va «O'zgartirish» shakli. Saqlash shu
 * kalitning to'liq ro'yxatini yuboradi (shu oyning qatori almashadi yoki
 * qo'shiladi, qolganlari turadi).
 */
export function TaxRateRow({
  id,
  label,
  list,
  thisMonth,
  saving,
  busy,
  onSave,
}: {
  /** Barqaror kalit (tarjima qilinmaydi): maydon id lari shundan. */
  id: string;
  label: string;
  list: DatedRate[];
  /** Toshkent bo'yicha joriy oy, YYYY-MM. */
  thisMonth: string;
  /** Shu qatorning saqlashi ketmoqda (aylanuvchi belgi). */
  saving: boolean;
  /** Istalgan saqlash ketmoqda: ikki marta bosib bo'lmaydi. */
  busy: boolean;
  onSave: (fullList: DatedRate[]) => Promise<unknown>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [value, setValue] = useState("");
  const [askMonth, setAskMonth] = useState<string | null>(null);
  // Xato foydalanuvchi yozgandan keyingina chiqadi, forma ochilishi bilan emas.
  const [touched, setTouched] = useState(false);

  const now = currentRate(list, thisMonth);
  const draft = { fromMonth: month, value };
  const error = touched ? rowError(draft) : null;
  const canSave = rowError(draft) === null;

  const send = () => {
    const [row] = toRatePayload([draft]);
    void onSave(mergeRateRow(list, row)).then(
      () => {
        setOpen(false);
        setValue("");
        setTouched(false);
      },
      () => undefined, // xabarni umumiy mutatsiya ko'rsatadi
    );
  };

  const submit = () => {
    if (!canSave) return;
    if (month < thisMonth) setAskMonth(month);
    else send();
  };

  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{label}</div>
          {now === null ? (
            <div className="text-sm text-yellow-700 dark:text-yellow-300">{t("kiritilmagan")}</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("Shu oy:")} <span className="font-semibold text-foreground">{percentText(now)}</span>
            </div>
          )}
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("O'zgartirish")}
          </Button>
        )}
      </div>

      {list.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {list.map((r) => (
            <li key={r.fromMonth}>
              {t("{oy} dan —", { oy: r.fromMonth })} {percentText(r.value)}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={`m-${id}`}>{t("Qaysi oydan")}</Label>
              <Input
                id={`m-${id}`}
                type="month"
                className="w-40"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setTouched(true);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`v-${id}`}>{t("Foiz")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`v-${id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-24 text-center"
                  value={value}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => {
                    setValue(percentInput(e.target.value));
                    setTouched(true);
                  }}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <Button size="sm" disabled={!canSave || busy} onClick={submit}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("Saqlash")}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {t("Bekor qilish")}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{t(error)}</p>}
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
