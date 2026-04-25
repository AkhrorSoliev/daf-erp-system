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

const ROLES = [
  { id: 1, label: "CEO", icon: Crown },
  { id: 2, label: "Direktor", icon: Building2 },
  { id: 3, label: "Administrator", icon: Shield },
  { id: 4, label: "O'qituvchi", icon: GraduationCap },
  { id: 5, label: "Kassir", icon: Wallet },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Faol" },
  { value: "INACTIVE", label: "Nofaol" },
  { value: "SUSPENDED", label: "To'xtatilgan" },
  { value: "TERMINATED", label: "Ishdan bo'shatilgan" },
];

const schema = z.object({
  firstName: z.string().min(2, "Ism kamida 2 ta belgidan iborat bo'lishi kerak"),
  lastName: z.string().min(2, "Familiya kamida 2 ta belgidan iborat bo'lishi kerak"),
  phone: z
    .string()
    .regex(/^\d{9}$/, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
    .or(z.literal("")),
  login: z.string().optional().or(z.literal("")),
  password: z.string().min(4, "Parol kamida 4 ta belgi").optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", ""]).optional(),
  status: z.string().optional(),
  mainBranch: z.string().optional(),
  roleIds: z.array(z.number()).min(1, "Kamida bitta lavozim tanlang"),
  branchIds: z.array(z.number()),
});

type FormValues = z.infer<typeof schema>;

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
      password: "",
      gender: (employee?.gender as "MALE" | "FEMALE" | "") ?? "",
      status: employee?.status ?? "ACTIVE",
      mainBranch: employee?.mainBranch ? String(employee.mainBranch) : "",
      roleIds: employee?.roles.map((r) => r.id) ?? [],
      branchIds: employee?.branches.map((b) => b.id) ?? [],
    },
  });

  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const { data } = await api.get("/branches");
      const list = Array.isArray(data) ? data : (data.data || []);
      setBranches(list.map((b: any) => ({ id: b.id, name: b.name })));
    } catch {
      setBranches([]);
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
  };

  const toggleBranch = (branchId: number) => {
    const current = form.getValues("branchIds");
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    form.setValue("branchIds", next);
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        roleIds: values.roleIds,
        branchIds: values.branchIds,
      };
      if (values.phone) payload.phone = values.phone;
      if (values.login) payload.login = values.login;
      if (values.password) payload.password = values.password;
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

      {/* Kirish ma'lumotlari */}
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
            <Label htmlFor="password">{isEdit ? "Yangi parol" : "Parol"}</Label>
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

      {/* Lavozim va filial */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Lavozim va filial
        </h3>

        {/* Roles */}
        <div className="space-y-2.5">
          <Label>Lavozimlar *</Label>
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
          <Label>Filiallar</Label>
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
        </div>

        {watchBranchIds.length > 1 && (
          <div className="space-y-1.5">
            <Label>Asosiy filial</Label>
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
