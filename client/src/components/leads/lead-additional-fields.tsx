"use client";

import { useRef, useState } from "react";
import { Phone, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LeadAdditionalFieldsProps {
  value: string;
  /** Mirrors PhoneInput's event-like signature so it can be wired straight to
   *  a react-hook-form Controller field. */
  onChange: (e: { target: { name?: string; value: string } }) => void;
  error?: string;
}

/**
 * The "Qo'shimcha ma'lumotlar" panel of the lead drawers, mirroring the
 * student one: an icon row where each icon reveals an optional field, and
 * un-toggling clears what was typed. Today it holds a single field — the
 * second contact number — and is the place any further optional lead field
 * (parent, telegram) goes when it is asked for.
 */
export function LeadAdditionalFields({
  value,
  onChange,
  error,
}: LeadAdditionalFieldsProps) {
  const [opened, setOpened] = useState(false);
  const iconsRef = useRef<HTMLDivElement>(null);

  // Derived, not stored: a saved number opens the panel on its own, so the
  // edit drawer filling the form after mount needs no effect to catch up.
  // Toggling off clears the value, which closes the panel through the same
  // expression.
  const visible = opened || Boolean(value);

  const toggle = () => {
    if (visible) {
      setOpened(false);
      onChange({ target: { name: "extraPhone", value: "" } });
      return;
    }
    setOpened(true);
    requestAnimationFrame(() => {
      iconsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Plus className="size-3.5" />
        Qo&apos;shimcha ma&apos;lumotlar
      </h3>

      {visible && (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-4">
          <Label htmlFor="extraPhone">Qo&apos;shimcha telefon</Label>
          <PhoneInput
            id="extraPhone"
            name="extraPhone"
            value={value}
            onChange={onChange}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <div ref={iconsRef} className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-lg border transition-colors",
                visible
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              <Phone className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Qo&apos;shimcha telefon</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
