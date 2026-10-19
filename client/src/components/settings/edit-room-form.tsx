"use client";

import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { ruleMessage } from "./settings-form-parts";

interface EditRoomFormProps {
  room: Room | null;
  onClose: () => void;
  onSaved?: (room: Room) => void;
  formId: string;
  isAdd?: boolean;
  branchId?: number | null;
}

export function EditRoomForm({
  room,
  onClose,
  onSaved,
  formId,
  isAdd,
  branchId,
}: EditRoomFormProps) {
  const t = useT();
  const setSubmitting = useEditRoom((s) => s.setSubmitting);

  const form = useForm({
    defaultValues: {
      name: room?.name ?? "",
      capacity: room?.capacity ?? ("" as unknown as number),
    },
  });

  const onSubmit = async (values: { name: string; capacity: number }) => {
    setSubmitting(true);
    try {
      if (isAdd) {
        const companyId = localStorage.getItem("companyId");
        const { data } = await api.post("/rooms", {
          name: values.name,
          capacity: values.capacity || undefined,
          branchId: branchId,
          companyId: companyId ? Number(companyId) : undefined,
        });

        const created: Room = {
          id: data.id,
          name: data.name,
          capacity: data.capacity,
          branchId: data.branchId,
          branchName: data.branch?.name ?? "",
        };

        toast.success(t("Yangi xona muvaffaqiyatli qo'shildi"));
        onSaved?.(created);
      } else {
        if (!room) return;
        const { data } = await api.patch(`/rooms/${room.id}`, {
          name: values.name,
          capacity: values.capacity || undefined,
        });

        const updated: Room = {
          id: data.id,
          name: data.name,
          capacity: data.capacity,
          branchId: data.branchId,
          branchName: data.branch?.name ?? "",
        };

        toast.success(t("Xona muvaffaqiyatli yangilandi"));
        onSaved?.(updated);
      }
      onClose();
    } catch {
      toast.error(
        isAdd
          ? t("Xona qo'shishda xatolik yuz berdi")
          : t("Xonani yangilashda xatolik yuz berdi"),
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
          {t("Xona ma'lumotlari")}
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">{t("Xona nomi")}</Label>
          <Input
            id="name"
            placeholder={t("101-xona")}
            {...form.register("name", {
              required: msg("Xona nomi kiritilishi shart"),
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {ruleMessage(t, form.formState.errors.name.message)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="capacity">{t("Sig'imi")}</Label>
          <Input
            id="capacity"
            type="number"
            min={1}
            placeholder="20"
            {...form.register("capacity", { valueAsNumber: true })}
          />
        </div>
      </section>
    </form>
  );
}
