"use client";

import { Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Button as LumioButton,
  Input as LumioInput,
  Field as LumioField,
} from "@/components/student-portal/lumio";

// The password-reset flow is one component with two skins: shadcn for the admin
// and teacher logins, Lumio for the student portal. The three steps, the OTP
// cooldown and every API call are shared — only these leaves differ, so they
// live here rather than as branches scattered through the dialog's JSX.
//
// Why not a second dialog component: the flow is three stateful steps with a
// resend timer and a single-use reset token. A parallel copy would be two
// places to fix the next time the OTP contract moves.

export type FpVariant = "default" | "lumio";

const SHADCN_INPUT =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface FieldProps {
  lumio: boolean;
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}

export function FpField({ lumio, label, htmlFor, children }: FieldProps) {
  if (lumio) return <LumioField label={label}>{children}</LumioField>;
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Phone entry. Both skins keep the non-editable `+998` prefix and the 9-digit
 * cap — unlike the sign-in forms, this field must stay Uzbek-only because Eskiz
 * only delivers OTP codes to Uzbek numbers.
 */
export function FpPhoneInput({
  lumio,
  value,
  onChange,
}: {
  lumio: boolean;
  value: string;
  onChange: (raw: string) => void;
}) {
  const shared = {
    id: "fp-phone",
    type: "text" as const,
    inputMode: "numeric" as const,
    autoFocus: true,
    required: true,
    value,
    placeholder: "XX XXX XX XX",
    maxLength: 12,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value.replace(/\D/g, "").slice(0, 9)),
  };

  if (lumio) return <LumioInput addon="+998" {...shared} />;

  return (
    <div className="flex">
      <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
        +998
      </span>
      <input {...shared} className={cn(SHADCN_INPUT, "rounded-l-none")} />
    </div>
  );
}

/** The 4-digit OTP box — wide letter-spacing in both skins. */
export function FpCodeInput({
  lumio,
  value,
  onChange,
}: {
  lumio: boolean;
  value: string;
  onChange: (raw: string) => void;
}) {
  const shared = {
    id: "fp-code",
    type: "text" as const,
    inputMode: "numeric" as const,
    autoFocus: true,
    required: true,
    value,
    placeholder: "••••",
    maxLength: 4,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value.replace(/\D/g, "").slice(0, 4)),
  };

  // Lumio's Input takes className on its wrapper, so the type styles reach the
  // inner element through an arbitrary variant.
  if (lumio) {
    return (
      <LumioInput
        className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em]"
        {...shared}
      />
    );
  }

  return (
    <input
      {...shared}
      className={cn(SHADCN_INPUT, "text-center text-lg tracking-[0.5em]")}
    />
  );
}

/**
 * A password box. Lumio's Input ships its own per-field reveal toggle, so the
 * shared `show` state only drives the shadcn skin.
 */
export function FpPasswordInput({
  lumio,
  id,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  show,
  onToggleShow,
}: {
  lumio: boolean;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  show: boolean;
  onToggleShow?: () => void;
}) {
  const shared = {
    id,
    autoFocus,
    required: true,
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
  };

  if (lumio) return <LumioInput type="password" {...shared} />;

  return (
    <div className="relative">
      <input
        {...shared}
        type={show ? "text" : "password"}
        className={cn(SHADCN_INPUT, onToggleShow && "pr-10")}
      />
      {onToggleShow ? (
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

export function FpSubmit({
  lumio,
  loading,
  children,
}: {
  lumio: boolean;
  loading: boolean;
  children: React.ReactNode;
}) {
  if (lumio) {
    return (
      <LumioButton type="submit" block size="lg" loading={loading}>
        {children}
      </LumioButton>
    );
  }
  return (
    <Button type="submit" size="lg" className="w-full" disabled={loading}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function FpError({
  lumio,
  children,
}: {
  lumio: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        lumio
          ? "border border-danger/40 bg-danger/10 font-semibold text-danger"
          : "border border-destructive/50 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </div>
  );
}
