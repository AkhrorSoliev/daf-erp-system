"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeSlash } from "@phosphor-icons/react";

export interface LumioInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  iconBefore?: React.ReactNode;
  /** Text prefixed inside the field, e.g. the non-editable `+998`. */
  addon?: React.ReactNode;
}

// Lumio text field — tall, rounded, sunk-tinted with a coral focus ring.
export const Input = React.forwardRef<HTMLInputElement, LumioInputProps>(
  function Input({ className, iconBefore, addon, type = "text", ...rest }, ref) {
    const isPassword = type === "password";
    const [show, setShow] = React.useState(false);
    const resolvedType = isPassword ? (show ? "text" : "password") : type;
    return (
      <div
        className={cn(
          "flex h-[54px] items-center gap-2 rounded-md border border-line bg-surface px-4 transition-[border-color,box-shadow] focus-within:border-coral-500 focus-within:ring-4 focus-within:ring-coral-500/20",
          className,
        )}
      >
        {iconBefore ? (
          <span className="shrink-0 text-xl text-ink-400">{iconBefore}</span>
        ) : null}
        {addon ? (
          <span className="shrink-0 select-none font-display font-bold text-ink-500">
            {addon}
          </span>
        ) : null}
        <input
          ref={ref}
          type={resolvedType}
          className="h-full w-full min-w-0 bg-transparent font-semibold text-ink-900 outline-none placeholder:text-ink-400"
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
            onClick={() => setShow((s) => !s)}
            className="shrink-0 text-xl text-ink-400 transition-colors hover:text-ink-700"
          >
            {show ? <EyeSlash /> : <Eye />}
          </button>
        ) : null}
      </div>
    );
  },
);

// Labelled field wrapper.
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block px-1 text-sm font-bold text-ink-700">{label}</span>
      {children}
    </label>
  );
}
