"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LeadAdditionalFields } from "./lead-additional-fields";
import { LeadSourcePicker } from "./lead-source-picker";

interface EditLeadValues {
  firstName: string;
  lastName: string;
  phone: string;
  extraPhone: string;
  sourceId: string;
}

export function EditLeadDrawer() {
  const editLead = useLeadsUi((s) => s.editLead);
  const closeEditLead = useLeadsUi((s) => s.closeEditLead);
  const applyLeadUpdate = useLeadsBoard((s) => s.applyLeadUpdate);

  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EditLeadValues>({
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      extraPhone: "",
      sourceId: "",
    },
  });

  const open = !!editLead;

  useEffect(() => {
    if (!editLead) return;
    reset({
      firstName: editLead.firstName,
      lastName: editLead.lastName,
      phone: editLead.phone,
      extraPhone: editLead.extraPhone,
      sourceId: editLead.sourceId,
    });
    setSubmitting(false);
  }, [editLead, reset]);

  async function onSubmit(values: EditLeadValues) {
    if (!editLead) return;
    setSubmitting(true);
    try {
      const { data } = await api.patch<LeadCard>(`/leads/${editLead.id}`, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone,
        // Always sent: an empty string is how the panel clears a saved number.
        extraPhone: values.extraPhone,
        sourceId: values.sourceId,
      });
      applyLeadUpdate(editLead.sectionId, data);
      toast.success("Lid yangilandi");
      closeEditLead();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lidni yangilashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !submitting && closeEditLead()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Lidni tahrirlash</SheetTitle>
          <SheetDescription>
            Lid ma&apos;lumotlarini o&apos;zgartiring
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form
            id="edit-lead-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5 px-6 py-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-firstName">Ism</Label>
                <Input
                  id="edit-firstName"
                  {...register("firstName", {
                    required: "Ism kiritilishi shart",
                  })}
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-lastName">Familya</Label>
                <Input
                  id="edit-lastName"
                  {...register("lastName", {
                    required: "Familya kiritilishi shart",
                  })}
                />
                {errors.lastName && (
                  <p className="text-sm text-destructive">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Telefon raqami</Label>
              <Controller
                name="phone"
                control={control}
                rules={{
                  validate: (v) =>
                    v.length === 9 || "Telefon raqamini to'liq kiriting",
                }}
                render={({ field }) => (
                  <PhoneInput value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <Controller
              name="sourceId"
              control={control}
              render={({ field }) => (
                <LeadSourcePicker
                  open={open}
                  value={field.value}
                  onChange={field.onChange}
                  label="Lid manbasi (ixtiyoriy)"
                  id="edit-lead-sourceId"
                  loadErrorMessage="Manbalarni yuklashda xatolik"
                />
              )}
            />

            <Controller
              name="extraPhone"
              control={control}
              rules={{
                validate: (v) =>
                  !v || v.length === 9 || "Telefon raqamini to'liq kiriting",
              }}
              render={({ field }) => (
                <LeadAdditionalFields
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.extraPhone?.message}
                />
              )}
            />
          </form>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeEditLead}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button type="submit" form="edit-lead-form" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
