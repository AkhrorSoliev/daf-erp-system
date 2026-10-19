"use client";

import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { TimePicker } from "@/components/ui/time-picker";
import { useEditBranch, type Branch } from "@/hooks/use-edit-branch";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import {
  branchUpdateBody,
  toBranch,
  type BranchFormValues,
} from "@/lib/branch-record";

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
  const t = useT();
  const setSubmitting = useEditBranch((s) => s.setSubmitting);
  const refetchBranches = useBranchSwitcher((s) => s.refetchBranches);

  const form = useForm<BranchFormValues>({
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      startOfWorkingDay: branch?.startOfWorkingDay ?? "",
      endOfWorkingDay: branch?.endOfWorkingDay ?? "",
      city: branch?.city ?? "",
      representativeName: branch?.representativeName ?? "",
      representativePosition: branch?.representativePosition ?? "",
    },
  });

  const onSubmit = async (values: BranchFormValues) => {
    setSubmitting(true);
    try {
      if (isAdd) {
        const companyId = localStorage.getItem("companyId");
        const { data } = await api.post("/branches", {
          name: values.name,
          address: values.address || undefined,
          phone: values.phone || undefined,
          startOfWorkingDay: values.startOfWorkingDay || undefined,
          endOfWorkingDay: values.endOfWorkingDay || undefined,
          city: values.city.trim() || undefined,
          representativeName: values.representativeName.trim() || undefined,
          representativePosition:
            values.representativePosition.trim() || undefined,
          companyId: companyId ? Number(companyId) : undefined,
        });

        const created = toBranch(data);

        toast.success(t("Yangi filial muvaffaqiyatli qo'shildi"));
        onSaved?.(created);
        refetchBranches();
      } else {
        if (!branch) return;
        const { data } = await api.patch(
          `/branches/${branch.id}`,
          branchUpdateBody(values),
        );

        const updated = toBranch(data);

        toast.success(t("Filial muvaffaqiyatli yangilandi"));
        onSaved?.(updated);
        refetchBranches();
      }
      onClose();
    } catch {
      toast.error(
        isAdd
          ? t("Filial qo'shishda xatolik yuz berdi")
          : t("Filialni yangilashda xatolik yuz berdi"),
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
          {t("Filial ma'lumotlari")}
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">{t("Filial nomi")}</Label>
          <Input
            id="name"
            placeholder={t("Filial nomi")}
            {...form.register("name", {
              required: t("Filial nomi kiritilishi shart"),
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>{t("Telefon")}</Label>
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
            <Label>{t("Ish boshlanish vaqti")}</Label>
            <Controller
              control={form.control}
              name="startOfWorkingDay"
              render={({ field }) => (
                <TimePicker
                  value={field.value || undefined}
                  onChange={field.onChange}
                  placeholder={t("Boshlanish vaqti")}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Ish tugash vaqti")}</Label>
            <Controller
              control={form.control}
              name="endOfWorkingDay"
              render={({ field }) => (
                <TimePicker
                  value={field.value || undefined}
                  onChange={field.onChange}
                  placeholder={t("Tugash vaqti")}
                />
              )}
            />
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t px-6 py-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("Shartnoma uchun")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Bu maydonlar o'quvchi shartnomasiga chiqadi. To'ldirilmaguncha filial o'quvchilariga shartnoma tuzilmaydi.")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">{t("Manzil")}</Label>
          <Input
            id="address"
            placeholder={t("Masalan: Namangan sh., Istiqlol ko'chasi, 48")}
            {...form.register("address")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="city">{t("Shahar")}</Label>
            <Input id="city" placeholder="Namangan" {...form.register("city")} />
            <p className="text-xs text-muted-foreground">
              {t("«shahri» so'zi shartnomada o'zi qo'shiladi")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="representativePosition">{t("Vakil lavozimi")}</Label>
            <Input
              id="representativePosition"
              placeholder={t("Direktor")}
              {...form.register("representativePosition")}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="representativeName">{t("Vakil F.I.O.")}</Label>
          <Input
            id="representativeName"
            placeholder={t("Familiya Ism Otasining ismi")}
            {...form.register("representativeName")}
          />
        </div>
      </section>
    </form>
  );
}
