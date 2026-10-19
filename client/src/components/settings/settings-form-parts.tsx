"use client";

import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/context";

/**
 * «O'quv qoidalari» sahifasining uch bloki (pauza, DaF normasi, hujjat) bir
 * xil ko'rinsin va bir xil ishlasin deb shu yerdagi bo'laklardan quriladi:
 * karta, strelkasiz raqam maydoni, xato qatori va «Saqlanmagan o'zgarish»
 * paneli. Mantiq (qoralama, tekshiruv) har blokning o'z faylida qoladi.
 */

/** Blokning kartasi: kenglik, chegara va ichki oraliq bir joyda. */
export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="max-w-xl space-y-5 rounded-lg border p-4 sm:p-6">{children}</div>;
}

/** Karta ichidagi to'g'ri bo'lmagan qiymat haqidagi bitta qator. */
export function FormError({ children }: { children: ReactNode }) {
  return <p className="text-sm text-destructive">{children}</p>;
}

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Raqamli maydon: matn (brauzer strelkalari yo'q), raqamdan boshqasi
 * kiritilmaydi, birligi yonida, xatosi va qisqa izohi tagida. Qiymat matn
 * bo'lib turadi: tozalangan maydon `0` bo'lib qolmaydi.
 */
export function UnitNumberField({
  id,
  label,
  unit,
  value,
  hint,
  error,
  disabled,
  onChange,
  className,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  onChange: (text: string) => void;
  className?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={`min-w-28 flex-1 space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-20 text-center"
          onChange={(e) => onChange(digitsOnly(e.target.value))}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/**
 * «Saqlanmagan o'zgarish bor» paneli. O'zgarish bo'lmasa (va saqlash
 * ketmayotgan bo'lsa) hech narsa chizilmaydi. «Saqlash» faqat qiymatlar
 * yaroqli bo'lganda faol.
 */
export function SettingsSaveBar({
  dirty,
  canSave,
  saving,
  onCancel,
  onSave,
}: {
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  if (!dirty && !saving) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <span className="inline-flex items-center gap-1.5 text-sm text-yellow-700 dark:text-yellow-300">
        <AlertCircle className="size-4" aria-hidden />
        {t("Saqlanmagan o'zgarish bor")}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          {t("Bekor qilish")}
        </Button>
        <Button disabled={!canSave || saving} onClick={onSave}>
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("Saqlash")}
        </Button>
      </div>
    </div>
  );
}
