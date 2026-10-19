"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  Check,
  Shield,
  Building2,
  GraduationCap,
  Wallet,
  Crown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { roleFieldFor } from "@/lib/role-grant-ceiling";
import { isOwnAccount, withoutOwnSignInKeys } from "@/lib/own-sign-in-keys";
import { useAuth } from "@/hooks/use-auth";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { roleLabel } from "@/components/payments/salary-utils";
import { roleTitle } from "@/components/profile/profile-roles";
import { getStatusConfig } from "@/lib/status-config";
import {
  CEO_ROLE_ID,
  TEACHER_ROLE_ID,
  employeeFormError,
  employeeSchema,
  type EmployeeFormValues,
} from "@/lib/schemas/employee-schema";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { EmployeeCredentialsSection } from "./employee-credentials-section";
import {
  EmployeeRolePicker,
  EmployeeRolesReadOnly,
  type RoleOption,
} from "./employee-roles-field";

// The title of each role comes from the shared role-label helper (`roleTitle`).
const ROLES: Omit<RoleOption, "label">[] = [
  { id: CEO_ROLE_ID, icon: Crown },
  { id: 2, icon: Building2 },
  { id: 3, icon: Shield },
  { id: TEACHER_ROLE_ID, icon: GraduationCap },
  { id: 5, icon: Wallet },
];

// The shared user status labels (`msg()` texts in status-config.ts).
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"].map((value) => ({
  value,
  label: getStatusConfig("users", value).label,
}));

const BRANCHES_LOAD_ERROR = msg("Filiallarni yuklashda xatolik");

export type FormValues = EmployeeFormValues;

interface EditEmployeeFormProps {
  employee: EmployeeUser | null;
  onClose: () => void;
  onSaved?: (data: EmployeeUser) => void;
  formId: string;
}

interface BranchOption {
  id: number;
  name: string;
}

export function EditEmployeeForm({ employee, onClose, onSaved, formId }: EditEmployeeFormProps) {
  const isEdit = !!employee;
  const t = useT();
  // The branch fetch toasts through a ref copy, so a language switch never refetches.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const currentUser = useAuth((s) => s.user);
  const currentUserId = currentUser?.id;
  // Your own record: phone, login and password change only in Profil, where
  // the current password is asked (ADR-0031).
  const ownAccount = isOwnAccount(employee?.id, currentUserId);
  const { submitting, setSubmitting } = useEditEmployee();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  // The role ceiling (ADR-0026): the field offers only the roles this caller
  // may grant, or lists the employee's roles read-only when any of them is
  // outside that ceiling (a non-CEO's own record included). See roleFieldFor.
  const roleField = roleFieldFor(
    currentUser?.roles.map((r) => r.name) ?? [],
    employee?.roles.map((r) => r.id) ?? [],
  );
  const roleOptions: RoleOption[] =
    roleField.mode === "hidden"
      ? []
      : ROLES.filter((r) => roleField.roleIds.includes(r.id)).map((r) => ({
          ...r,
          label: roleTitle(r, t, { grant: true }),
        }));

  const form = useForm<FormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: employee?.firstName ?? "",
      lastName: employee?.lastName ?? "",
      phone: employee?.phone ?? "",
      login: employee?.login ?? "",
      position: employee?.position ?? roleLabel(employee?.roles ?? []).replace("—", ""),
      password: "",
      gender: (employee?.gender as "MALE" | "FEMALE" | "") ?? "",
      status: employee?.status ?? "ACTIVE",
      mainBranch: employee?.mainBranch ? String(employee.mainBranch) : "",
      roleIds: employee?.roles.map((r) => r.id) ?? [],
      branchIds: employee?.branches.map((b) => b.id) ?? [],
      isEdit,
    },
  });

  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const { data } = await api.get("/branches");
      const list = Array.isArray(data) ? data : (data.data || []);
      setBranches(list.map((b: any) => ({ id: b.id, name: b.name })));
    } catch (error) {
      setBranches([]);
      toast.error(getErrorMessage(error, tRef.current(BRANCHES_LOAD_ERROR)));
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const toggleRole = (roleId: number) => {
    const current = form.getValues("roleIds");
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    form.setValue("roleIds", next, { shouldValidate: true });
    // Losing the last role hides the Kirish ma'lumotlari section — clear the
    // fields too, so stale state can never be resubmitted once it reappears.
    if (next.length === 0) {
      form.setValue("login", "");
      form.setValue("password", "");
    }
    // Role changes affect branchIds requirement (non-CEO needs branches)
    if (form.formState.isSubmitted) {
      void form.trigger("branchIds");
    }
  };

  const toggleBranch = (branchId: number) => {
    const current = form.getValues("branchIds");
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    form.setValue("branchIds", next, { shouldValidate: form.formState.isSubmitted });
    // Branch count affects mainBranch requirement
    if (form.formState.isSubmitted && next.length > 1) {
      void form.trigger("mainBranch");
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      // Read-only roles go back exactly as they were loaded: the backend
      // accepts an unchanged set and refuses any change to it.
      const roleIds =
        roleField.mode === "read-only" ? roleField.roleIds : values.roleIds;
      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        position: values.position,
        roleIds,
        branchIds: values.branchIds,
      };
      if (values.phone) payload.phone = values.phone;
      // A role-less employee can never carry a login/password — the backend
      // rejects both, and it already nulls them itself when the saved role
      // set is empty. Only forward what the (now-hidden) fields hold when a
      // role is actually present.
      if (roleIds.length > 0) {
        if (values.login) payload.login = values.login;
        if (values.password) payload.password = values.password;
      }
      if (values.gender) payload.gender = values.gender;
      if (values.mainBranch) payload.mainBranch = Number(values.mainBranch);
      if (isEdit && values.status) payload.status = values.status;

      let saved: EmployeeUser;
      if (isEdit) {
        const { data } = await api.patch(
          `/users/${employee.id}`,
          withoutOwnSignInKeys(payload, ownAccount),
        );
        saved = data;
        toast.success(t("Xodim muvaffaqiyatli yangilandi"));
      } else {
        const { data } = await api.post("/users", payload);
        saved = data;
        toast.success(t("Xodim muvaffaqiyatli qo'shildi"));
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik")));
    } finally {
      setSubmitting(false);
    }
  };

  const watchRoleIds = form.watch("roleIds");
  const hasRoles = watchRoleIds.length > 0;
  const watchBranchIds = form.watch("branchIds");

  if (branchesLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      {/* Asosiy ma'lumotlar */}
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("Asosiy ma'lumotlar")}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t("Ism")} *</Label>
            <Input
              id="firstName"
              placeholder={t("Ism")}
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-xs text-destructive">
                {employeeFormError(t, form.formState.errors.firstName.message)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t("Familiya")} *</Label>
            <Input
              id="lastName"
              placeholder={t("Familiya")}
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-xs text-destructive">
                {employeeFormError(t, form.formState.errors.lastName.message)}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>{t("Telefon")}</Label>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  disabled={ownAccount}
                />
              )}
            />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">
                {employeeFormError(t, form.formState.errors.phone.message)}
              </p>
            )}
            {ownAccount && (
              <p className="text-xs text-muted-foreground">
                {/* The «**…**» span of the sentence is the link to Profil. */}
                {t("O'z telefoningiz va parolingiz **Profil** sahifasida o'zgartiriladi.")
                  .split("**")
                  .map((part, i) =>
                    i % 2 === 1 ? (
                      <Link key={i} href="/profile" className="font-medium text-primary hover:underline">
                        {part}
                      </Link>
                    ) : (
                      part
                    ),
                  )}
              </p>
            )}
          </div>
          <div className="w-28 shrink-0 space-y-1.5">
            <Label>{t("Jinsi")}</Label>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Tanlang")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">{t("Erkak")}</SelectItem>
                    <SelectItem value="FEMALE">{t("Ayol")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </section>

      {/* Kirish ma'lumotlari — faqat tizim roli berilganda.
          Rolsiz xodim baribir kira olmaydi (backend parolni rad etadi), shuning
          uchun maydonlarni ko'rsatish faqat chalg'itadi. */}
      {hasRoles && (
        <EmployeeCredentialsSection form={form} isEdit={isEdit} locked={ownAccount} />
      )}

      {/* Lavozim va filial */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("Lavozim va filial")}
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="position">{t("Lavozim")} *</Label>
          <Input
            id="position"
            placeholder={t("Masalan: Farrosh, Qorovul, Administrator")}
            {...form.register("position")}
          />
          {form.formState.errors.position && (
            <p className="text-xs text-destructive">
              {employeeFormError(t, form.formState.errors.position.message)}
            </p>
          )}
        </div>

        {/* Roles — toggles, a read-only list, or nothing (roleFieldFor) */}
        {roleField.mode === "read-only" ? (
          <EmployeeRolesReadOnly roles={roleOptions} />
        ) : roleField.mode === "pick" ? (
          <EmployeeRolePicker
            roles={roleOptions}
            selectedRoleIds={watchRoleIds}
            onToggle={toggleRole}
            error={employeeFormError(t, form.formState.errors.roleIds?.message)}
          />
        ) : null}

        {/* Branches */}
        <div className="space-y-2.5">
          <Label>
            {t("Filiallar")}
            {!watchRoleIds.includes(CEO_ROLE_ID) && " *"}
          </Label>
          <div className="space-y-1.5">
            {branches.map((branch) => {
              const checked = watchBranchIds.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => toggleBranch(branch.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                    checked
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/30"
                  }`}
                >
                  <div className={`flex size-5 items-center justify-center rounded border transition-colors ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}>
                    {checked && <Check className="size-3" />}
                  </div>
                  <Building2 className={`size-4 ${checked ? "text-primary" : "text-muted-foreground/50"}`} />
                  <span className={checked ? "text-foreground font-medium" : ""}>{branch.name}</span>
                </button>
              );
            })}
          </div>
          {form.formState.errors.branchIds && (
            <p className="text-xs text-destructive">
              {employeeFormError(t, form.formState.errors.branchIds.message)}
            </p>
          )}
        </div>

        {watchBranchIds.length > 1 && (
          <div className="space-y-1.5">
            <Label>{t("Asosiy filial")} *</Label>
            <Controller
              control={form.control}
              name="mainBranch"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Tanlang")} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches
                      .filter((b) => watchBranchIds.includes(b.id))
                      .map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.mainBranch && (
              <p className="text-xs text-destructive">
                {employeeFormError(t, form.formState.errors.mainBranch.message)}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Holati — faqat tahrirlashda */}
      {isEdit && (
        <section className="space-y-5 border-t px-6 py-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("Holati")}
          </h3>

          <div className="space-y-1.5">
            <Label>{t("Xodim holati")}</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value || "ACTIVE"} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </section>
      )}

      <button type="submit" className="hidden" disabled={submitting} />
    </form>
  );
}
