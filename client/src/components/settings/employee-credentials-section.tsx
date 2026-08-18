"use client";

import { type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormValues } from "./edit-employee-form";

interface EmployeeCredentialsSectionProps {
  form: UseFormReturn<FormValues>;
  isEdit: boolean;
}

/**
 * "Kirish ma'lumotlari" — login + password. Rendered only when the employee
 * has at least one system role (the `hasRoles` gate lives in the parent
 * form); a role-less employee cannot sign in, so the backend rejects a
 * login/password on them.
 */
export function EmployeeCredentialsSection({ form, isEdit }: EmployeeCredentialsSectionProps) {
  return (
    <section className="space-y-5 border-t px-6 py-5">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Kirish ma&apos;lumotlari
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="login">Login</Label>
          <Input
            id="login"
            placeholder="Login"
            autoComplete="off"
            {...form.register("login")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">
            {isEdit ? "Yangi parol" : "Parol *"}
          </Label>
          <Input
            id="password"
            type="password"
            placeholder={isEdit ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Parol"}
            autoComplete="new-password"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>
      </div>

    </section>
  );
}
