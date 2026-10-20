"use client";

import { type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/context";
import {
  employeeFormError,
  type EmployeeFormValues as FormValues,
} from "@/lib/schemas/employee-schema";

interface EmployeeCredentialsSectionProps {
  form: UseFormReturn<FormValues>;
  isEdit: boolean;
  /** Your own record: login and password change only in Profil (ADR-0031). */
  locked?: boolean;
}

/**
 * "Kirish ma'lumotlari" — login + password. Rendered only when the employee
 * has at least one system role (the `hasRoles` gate lives in the parent
 * form); a role-less employee cannot sign in, so the backend rejects a
 * login/password on them.
 */
export function EmployeeCredentialsSection({
  form,
  isEdit,
  locked = false,
}: EmployeeCredentialsSectionProps) {
  const t = useT();
  return (
    <section className="space-y-5 border-t px-6 py-5">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t("Kirish ma'lumotlari")}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="login">{t("Login")}</Label>
          <Input
            id="login"
            placeholder={t("Login")}
            autoComplete="off"
            disabled={locked}
            {...form.register("login")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">
            {isEdit ? t("Yangi parol") : `${t("Parol")} *`}
          </Label>
          <Input
            id="password"
            type="password"
            placeholder={
              locked
                ? t("Profil sahifasida o'zgartiriladi")
                : isEdit
                  ? t("O'zgartirmaslik uchun bo'sh qoldiring")
                  : t("Parol")
            }
            autoComplete="new-password"
            disabled={locked}
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">
              {employeeFormError(t, form.formState.errors.password.message)}
            </p>
          )}
        </div>
      </div>

    </section>
  );
}
