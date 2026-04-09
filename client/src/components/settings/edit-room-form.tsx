"use client";

import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import api from "@/lib/api";

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

        toast.success("Yangi xona muvaffaqiyatli qo'shildi");
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

        toast.success("Xona muvaffaqiyatli yangilandi");
        onSaved?.(updated);
      }
      onClose();
    } catch {
      toast.error(
        isAdd
          ? "Xona qo'shishda xatolik yuz berdi"
          : "Xonani yangilashda xatolik yuz berdi",
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
          Xona ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Xona nomi</Label>
          <Input
            id="name"
            placeholder="101-xona"
            {...form.register("name", {
              required: "Xona nomi kiritilishi shart",
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="capacity">Sig&apos;imi</Label>
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
