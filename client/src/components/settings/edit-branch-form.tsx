"use client";

import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
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
import { TimePicker } from "@/components/ui/time-picker";
import { GroupDaysPicker } from "@/components/groups/group-days-picker";
import { useEditBranch, type Branch } from "@/hooks/use-edit-branch";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

const DEFAULT_WORKING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface EditBranchFormProps {
  branch: Branch | null;
  onClose: () => void;
  onSaved?: (branch: Branch) => void;
  formId: string;
  isAdd?: boolean;
}

export function EditBranchForm({
  branch,
  onClose,
  onSaved,
  formId,
  isAdd,
}: EditBranchFormProps) {
  const setSubmitting = useEditBranch((s) => s.setSubmitting);
  const refetchBranches = useBranchSwitcher((s) => s.refetchBranches);

  const form = useForm({
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      status: branch?.status ?? ("active" as const),
      workingDays: branch?.workingDays ?? DEFAULT_WORKING_DAYS,
      startOfWorkingDay: branch?.startOfWorkingDay ?? "",
      endOfWorkingDay: branch?.endOfWorkingDay ?? "",
    },
  });

  const onSubmit = async (values: {
    name: string;
    address: string;
    phone: string;
    status: "active" | "inactive";
    workingDays: string[];
    startOfWorkingDay: string;
    endOfWorkingDay: string;
  }) => {
    setSubmitting(true);
    try {
      if (isAdd) {
        const companyId = localStorage.getItem("companyId");
        const { data } = await api.post("/branches", {
          name: values.name,
          address: values.address || undefined,
          phone: values.phone || undefined,
          workingDays: values.workingDays,
          startOfWorkingDay: values.startOfWorkingDay || undefined,
          endOfWorkingDay: values.endOfWorkingDay || undefined,
          companyId: companyId ? Number(companyId) : undefined,
        });

        const created: Branch = {
          id: String(data.id),
          name: data.name,
          address: data.address ?? "",
          phone: data.phone ?? "",
          status: data.isActive ? "active" : "inactive",
          workingDays: data.workingDays ?? [],
          startOfWorkingDay: data.startOfWorkingDay ?? "",
          endOfWorkingDay: data.endOfWorkingDay ?? "",
        };

        toast.success("Yangi filial muvaffaqiyatli qo'shildi");
        onSaved?.(created);
        refetchBranches();
      } else {
        if (!branch) return;
        const { data } = await api.patch(`/branches/${branch.id}`, {
          name: values.name,
          address: values.address || undefined,
          phone: values.phone || undefined,
          isActive: values.status === "active",
          workingDays: values.workingDays,
          startOfWorkingDay: values.startOfWorkingDay || undefined,
          endOfWorkingDay: values.endOfWorkingDay || undefined,
        });

        const updated: Branch = {
          id: String(data.id),
          name: data.name,
          address: data.address ?? "",
          phone: data.phone ?? "",
          status: data.isActive ? "active" : "inactive",
          workingDays: data.workingDays ?? [],
          startOfWorkingDay: data.startOfWorkingDay ?? "",
          endOfWorkingDay: data.endOfWorkingDay ?? "",
        };

        toast.success("Filial muvaffaqiyatli yangilandi");
        onSaved?.(updated);
        refetchBranches();
      }
      onClose();
    } catch {
      toast.error(
        isAdd
          ? "Filial qo'shishda xatolik yuz berdi"
          : "Filialni yangilashda xatolik yuz berdi",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Filial ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Filial nomi</Label>
          <Input
            id="name"
            placeholder="Filial nomi"
            {...form.register("name", {
              required: "Filial nomi kiritilishi shart",
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Telefon</Label>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput value={field.value} onChange={field.onChange} />
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ish boshlanish vaqti</Label>
            <Controller
              control={form.control}
              name="startOfWorkingDay"
              render={({ field }) => (
                <TimePicker
                  value={field.value || undefined}
                  onChange={field.onChange}
                  placeholder="Boshlanish vaqti"
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ish tugash vaqti</Label>
            <Controller
              control={form.control}
              name="endOfWorkingDay"
              render={({ field }) => (
                <TimePicker
                  value={field.value || undefined}
                  onChange={field.onChange}
                  placeholder="Tugash vaqti"
                />
              )}
            />
          </div>
        </div>

        <Controller
          control={form.control}
          name="workingDays"
          render={({ field }) => (
            <GroupDaysPicker
              label="Ish kunlari"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        {!isAdd && (
          <div className="space-y-1.5">
            <Label>Holati</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: "active" | "inactive") =>
                form.setValue("status", value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="inactive">Nofaol</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </section>
    </form>
  );
}
