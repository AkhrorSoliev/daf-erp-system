"use client";

import { useState } from "react";
import { Info, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** A titled explanation in a dialog; the page and every row's «i» use it. */
export function InfoDialog({
  open,
  onOpenChange,
  title,
  lead,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {lead && <DialogDescription>{lead}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm text-muted-foreground">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SettingRowProps {
  label: string;
  /** Ties the label to a text input or select trigger. */
  htmlFor?: string;
  /** One sentence, always visible. */
  hint: string;
  /** The longer explanation, opened by the «i» button in a dialog. */
  details?: string;
  /** Company-level setting the viewer may not change. */
  locked?: boolean;
  /** This row's save is in flight. */
  saving?: boolean;
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
  saving,
  note,
  control,
  children,
}: SettingRowProps) {
  const [infoOpen, setInfoOpen] = useState(false);
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
            {details && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${label}: batafsil`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setInfoOpen(true)}
                  >
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Batafsil</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{hint}</p>
          {note}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saving && (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Saqlanmoqda"
            />
          )}
          {control}
        </div>
      </div>
      {children && (
        <div className="mt-2 divide-y pl-4 sm:pl-8 [&>*:last-child]:pb-0">{children}</div>
      )}
      {details && (
        <InfoDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title={label}
          lead={hint}
        >
          <p>{details}</p>
        </InfoDialog>
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

/**
 * A whole number from 0 (to `max` when given). Typing changes nothing on the
 * server: a changed field shows «Saqlash» and «Bekor», and Enter saves.
 * Anything out of range is refused and the field keeps what was typed.
 */
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

  const changed = input.trim() !== toText(saved);

  function handleSave() {
    const trimmed = input.trim();
    if (trimmed === "" && allowEmpty) {
      onSave(null);
      return;
    }
    const v = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(v) || v < 0 || (max !== undefined && v > max)) {
      toast.error(rangeError);
      return;
    }
    onSave(v);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div
        className={
          changed
            ? "flex items-center gap-2 rounded-md bg-amber-500/10 py-1 pl-2 pr-1 ring-1 ring-amber-500/40"
            : "flex items-center gap-2 py-1 pl-2 pr-1"
        }
      >
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          placeholder={placeholder}
          className="w-28 tabular-nums"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed && !disabled) handleSave();
            if (e.key === "Escape") setInput(toText(saved));
          }}
        />
        <span className="w-12 text-sm text-muted-foreground">{unit}</span>
      </div>
      {changed && !disabled && (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" onClick={handleSave}>
            Saqlash
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setInput(toText(saved))}
          >
            Bekor
          </Button>
        </div>
      )}
    </div>
  );
}
