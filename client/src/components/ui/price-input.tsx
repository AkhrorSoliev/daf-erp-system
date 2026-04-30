"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Formats a raw digit string with Uzbek thousands separators (space).
 * Examples: "500" → "500", "1500" → "1 500", "1500000" → "1 500 000"
 */
function formatPriceValue(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("uz-UZ");
}

/**
 * Strips separators and any non-digit, returns raw digits only.
 */
function stripPriceFormat(value: string): string {
  return value.replace(/\D/g, "");
}

interface PriceInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  "onChange" | "value"
> {
  value?: string;
  onChange?: (e: { target: { name?: string; value: string } }) => void;
  name?: string;
}

const PriceInput = React.forwardRef<HTMLInputElement, PriceInputProps>(
  ({ className, value = "", onChange, name, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => formatPriceValue(value));

    React.useEffect(() => {
      setDisplay(formatPriceValue(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = stripPriceFormat(e.target.value);
      const formatted = formatPriceValue(raw);
      setDisplay(formatted);

      // Emit raw digits to react-hook-form
      onChange?.({ target: { name, value: raw } });
    };

    return (
      <div className="flex">
        <Input
          ref={ref}
          className={cn(className)}
          placeholder="400 000"
          value={display}
          onChange={handleChange}
          name={name}
          inputMode="numeric"
          {...props}
        />
        <span className="inline-flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
          so&apos;m
        </span>
      </div>
    );
  },
);

PriceInput.displayName = "PriceInput";

export { PriceInput };
