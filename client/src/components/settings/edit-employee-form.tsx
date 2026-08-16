"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { roleLabel } from "@/components/payments/salary-utils";
import { EmployeeCredentialsSection } from "./employee-credentials-section";

const CEO_ROLE_ID = 1;
const TEACHER_ROLE_ID = 4;

const ROLES = [
  { id: CEO_ROLE_ID, label: "CEO", icon: Crown },
  { id: 2, label: "Direktor", icon: Building2 },
  { id: 3, label: "Administrator", icon: Shield },
  { id: TEACHER_ROLE_ID, label: "O'qituvchi", icon: GraduationCap },
  { id: 5, label: "Kassir", icon: Wallet },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Faol" },
  { value: "INACTIVE", label: "Nofaol" },
  { value: "SUSPENDED", label: "To'xtatilgan" },
  { value: "TERMINATED", label: "Ishdan bo'shatilgan" },
];

const schema = z
  .object({
    firstName: z.string().min(2, "Ism kamida 2 ta belgidan iborat bo'lishi kerak"),
    lastName: z.string().min(2, "Familiya kamida 2 ta belgidan iborat bo'lishi kerak"),
    phone: z
      .string()
      .regex(/^\d{9}$/, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
      .or(z.literal("")),
    login: z.string().optional().or(z.literal("")),
    password: z.string().optional().or(z.literal("")),
    gender: z.enum(["MALE", "FEMALE", ""]).optional(),
    status: z.string().optional(),
    mainBranch: z.string().optional(),
    position: z
      .string()
      .trim()
      .min(2, "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak")
      .max(60, "Lavozim 60 ta belgidan oshmasligi kerak"),
    roleIds: z.array(z.number()),
    branchIds: z.array(z.number()),
    isEdit: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const hasCeoRole = data.roleIds.includes(CEO_ROLE_ID);
    const hasTeacherRole = data.roleIds.includes(TEACHER_ROLE_ID);
    const hasRoles = data.roleIds.length > 0;

    if (!hasCeoRole && data.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branchIds"],
        message: !hasRoles
          ? "Tizimga kirmaydigan xodim uchun ham filial tanlanishi shart"
          : hasTeacherRole
            ? "O'qituvchi uchun kamida bitta filial tanlang"
            : "Kamida bitta filial tanlang",
      });
    }

    if (!data.isEdit && hasRoles) {
      if (!data.password || data.password.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Yangi xodim uchun parol majburiy (kamida 4 ta belgi)",
        });
      }
    } else if (data.password && data.password.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak",
      });
    }

    if (data.branchIds.length > 1 && !data.mainBranch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mainBranch"],
        message: "Bir nechta filial tanlanganda asosiy filial tanlanishi shart",
      });
    }
  });

export type FormValues = z.infer<typeof schema>;

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
  const { submitting, setSubmitting } = useEditEmployee();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
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
      toast.error(getErrorMessage(error, "Filiallarni yuklashda xatolik"));
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
      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        position: values.position,
        roleIds: values.roleIds,
        branchIds: values.branchIds,
      };
      if (values.phone) payload.phone = values.phone;
      // A role-less employee can never carry a login/password — the backend
      // rejects both, and it already nulls them itself when the saved role
      // set is empty. Only forward what the (now-hidden) fields hold when a
      // role is actually present.
      if (values.roleIds.length > 0) {
        if (values.login) payload.login = values.login;
        if (values.password) payload.password = values.password;
      }
      if (values.gender) payload.gender = values.gender;
      if (values.mainBranch) payload.mainBranch = Number(values.mainBranch);
      if (isEdit && values.status) payload.status = values.status;

      let saved: EmployeeUser;
      if (isEdit) {
        const { data } = await api.patch(`/users/${employee.id}`, payload);
        saved = data;
        toast.success("Xodim muvaffaqiyatli yangilandi");
      } else {
        const { data } = await api.post("/users", payload);
        saved = data;
        toast.success("Xodim muvaffaqiyatli qo'shildi");
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
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
          Asosiy ma&apos;lumotlar
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Ism *</Label>
            <Input
              id="firstName"
              placeholder="Ism"
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Familiya *</Label>
            <Input
              id="lastName"
              placeholder="Familiya"
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>Telefon</Label>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput value={field.value} onChange={field.onChange} />
              )}
            />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>
          <div className="w-28 shrink-0 space-y-1.5">
            <Label>Jinsi</Label>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Erkak</SelectItem>
                    <SelectItem value="FEMALE">Ayol</SelectItem>
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
      {hasRoles && <EmployeeCredentialsSection form={form} isEdit={isEdit} />}

      {/* Lavozim va filial */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Lavozim va filial
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="position">Lavozim *</Label>
          <Input
            id="position"
            placeholder="Masalan: Farrosh, Qorovul, Administrator"
            {...form.register("position")}
          />
          {form.formState.errors.position && (
            <p className="text-xs text-destructive">
              {form.formState.errors.position.message}
            </p>
          )}
        </div>

        {/* Roles */}
        <div className="space-y-2.5">
          <Label>Tizim huquqi</Label>
          <p className="text-xs text-muted-foreground">
            Rol berilmasa, xodim tizimga kira olmaydi — faqat ro'yxatda turadi
            va oylik oladi.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((role) => {
              const checked = watchRoleIds.includes(role.id);
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                    checked
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/30"
                  }`}
                >
                  <div className={`flex size-7 items-center justify-center rounded-md ${
                    checked ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {checked ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </div>
                  <span className={checked ? "font-medium" : ""}>{role.label}</span>
                </button>
              );
            })}
          </div>
          {form.formState.errors.roleIds && (
            <p className="text-xs text-destructive">{form.formState.errors.roleIds.message}</p>
          )}
        </div>

        {/* Branches */}
        <div className="space-y-2.5">
          <Label>
            Filiallar
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
            <p className="text-xs text-destructive">{form.formState.errors.branchIds.message}</p>
          )}
        </div>

        {watchBranchIds.length > 1 && (
          <div className="space-y-1.5">
            <Label>Asosiy filial *</Label>
            <Controller
              control={form.control}
              name="mainBranch"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
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
              <p className="text-xs text-destructive">{form.formState.errors.mainBranch.message}</p>
            )}
          </div>
        )}
      </section>

      {/* Holati — faqat tahrirlashda */}
      {isEdit && (
        <section className="space-y-5 border-t px-6 py-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Holati
          </h3>

          <div className="space-y-1.5">
            <Label>Xodim holati</Label>
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
                        {opt.label}
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
