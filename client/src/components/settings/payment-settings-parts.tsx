"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** One titled block of the payment settings page. */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <h3 className="border-b px-4 py-3 text-sm font-semibold sm:px-6">
        {title}
      </h3>
      <div className="divide-y px-4 sm:px-6">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  /** Ties the label to a text input or select trigger. */
  htmlFor?: string;
  /** One sentence, always visible. */
  hint: string;
  /** The longer explanation, folded under «Batafsil». */
  details?: string;
  /** Company-level setting the viewer may not change. */
  locked?: boolean;
  /** Extra line under the hint (e.g. the branch-override note). */
  note?: React.ReactNode;
  control: React.ReactNode;
  /** Settings that only work while this one is on, drawn indented under it. */
  children?: React.ReactNode;
}

/**
 * Label and hint on the left, the control on the right. When the row is too
 * narrow for both (a select on a phone), the control wraps below the text.
 */
export function SettingRow({
  label,
  htmlFor,
  hint,
  details,
  locked,
  note,
  control,
  children,
}: SettingRowProps) {
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-prose flex-1 basis-64 space-y-1">
          <div className="flex items-center gap-1.5">
            {htmlFor ? (
              <Label htmlFor={htmlFor}>{label}</Label>
            ) : (
              <p className="text-sm font-medium">{label}</p>
            )}
            {locked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock
                    className="size-3.5 text-muted-foreground"
                    aria-label="Faqat markaz rahbari o'zgartira oladi"
                  />
                </TooltipTrigger>
                <TooltipContent>Faqat markaz rahbari o&apos;zgartira oladi</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{hint}</p>
          {details && (
            <details className="text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer select-none hover:text-foreground">
                Batafsil
              </summary>
              <p className="mt-1">{details}</p>
            </details>
          )}
          {note}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children && (
        <div className="mt-2 divide-y pl-4 sm:pl-8 [&>*:last-child]:pb-0">{children}</div>
      )}
    </div>
  );
}

interface NumberSettingProps {
  id: string;
  saved: number | null;
  /** No upper bound when omitted. */
  max?: number;
  unit: string;
  rangeError: string;
  /** Empty saves `null` (no limit) instead of being refused. */
  allowEmpty?: boolean;
  placeholder?: string;
  disabled: boolean;
  onSave: (value: number | null) => void;
}

/** A whole number from 0 (to `max` when given), saved on blur; anything else is refused and put back. */
export function NumberSetting({
  id,
  saved,
  max,
  unit,
  rangeError,
  allowEmpty,
  placeholder,
  disabled,
  onSave,
}: NumberSettingProps) {
  const toText = (v: number | null) => (v === null ? "" : String(v));
  const [input, setInput] = useState(toText(saved));
  // A saved value from the server resets the field (set during render, the
  // pattern React documents for state derived from a prop).
  const [shownSaved, setShownSaved] = useState(saved);
  if (shownSaved !== saved) {
    setShownSaved(saved);
    setInput(toText(saved));
  }

  function handleBlur() {
    const trimmed = input.trim();
    if (trimmed === "" && allowEmpty) {
      if (saved !== null) onSave(null);
      return;
    }
    const v = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(v) || v < 0 || (max !== undefined && v > max)) {
      toast.error(rangeError);
      setInput(toText(saved));
      return;
    }
    if (v === saved) return;
    onSave(v);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        placeholder={placeholder}
        className="w-32 tabular-nums"
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onBlur={handleBlur}
      />
      <span className="w-14 text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}
