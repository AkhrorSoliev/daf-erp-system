"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Formats raw digits into XX XXX XX XX pattern.
 * Accepts up to 9 digits, returns formatted string.
 */
function formatPhoneValue(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 5));
  if (digits.length > 5) parts.push(digits.slice(5, 7));
  if (digits.length > 7) parts.push(digits.slice(7, 9));
  return parts.join(" ");
}

/**
 * Strips formatting spaces, returns raw 9-digit string.
 */
function stripPhoneFormat(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

interface PhoneInputProps
  extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> {
  value?: string;
  onChange?: (e: { target: { name?: string; value: string } }) => void;
  name?: string;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value = "", onChange, name, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() =>
      formatPhoneValue(value)
    );

    // Sync display when external value changes (e.g. form reset)
    React.useEffect(() => {
      setDisplay(formatPhoneValue(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = stripPhoneFormat(e.target.value);
      const formatted = formatPhoneValue(raw);
      setDisplay(formatted);

      // Emit raw digits to react-hook-form
      onChange?.({ target: { name, value: raw } });
    };

    return (
      <div className="flex">
        <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
          +998
        </span>
        <Input
          ref={ref}
          className={cn("rounded-l-none", className)}
          placeholder="XX XXX XX XX"
          maxLength={12}
          value={display}
          onChange={handleChange}
          name={name}
          inputMode="numeric"
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
