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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LeadAdditionalFields } from "./lead-additional-fields";
import { LeadSourcePicker } from "./lead-source-picker";

interface AddLeadValues {
  firstName: string;
  lastName: string;
  phone: string;
  extraPhone: string;
  sectionId: string;
  sourceId: string;
}

const EMPTY_VALUES: AddLeadValues = {
  firstName: "",
  lastName: "",
  phone: "",
  extraPhone: "",
  sectionId: "",
  sourceId: "",
};

export function AddLeadDrawer() {
  const { open, sectionId: presetSectionId } = useLeadsUi((s) => s.addLead);
  const closeAddLead = useLeadsUi((s) => s.closeAddLead);
  const board = useLeadsBoard((s) => s.board);
  const addLead = useLeadsBoard((s) => s.addLead);

  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddLeadValues>({ defaultValues: EMPTY_VALUES });

  const columnsWithSections = board.filter((c) => c.sections.length > 0);
  const sectionsExist = columnsWithSections.length > 0;

  useEffect(() => {
    if (!open) return;
    reset({ ...EMPTY_VALUES, sectionId: presetSectionId ?? "" });
    setSubmitting(false);
  }, [open, presetSectionId, reset]);

  async function onSubmit(values: AddLeadValues) {
    setSubmitting(true);
    try {
      const { data } = await api.post<LeadCard>("/leads", {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone,
        extraPhone: values.extraPhone || undefined,
        sectionId: values.sectionId,
        sourceId: values.sourceId || undefined,
      });
      addLead(values.sectionId, data);
      toast.success("Yangi lid qo'shildi");
      closeAddLead();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lid qo'shishda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !submitting && closeAddLead()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Yangi lid qo&apos;shish</SheetTitle>
          <SheetDescription>
            Potensial o&apos;quvchi ma&apos;lumotlarini kiriting
          </SheetDescription>
        </SheetHeader>

        {!sectionsExist ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium">Avval bo&apos;lim yarating</p>
            <p className="text-sm text-muted-foreground">
              Lid qo&apos;shish uchun ustunlardan birida kamida bitta
              bo&apos;lim bo&apos;lishi kerak.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <form
              id="add-lead-form"
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5 px-6 py-5"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Ism</Label>
                  <Input
                    id="firstName"
                    placeholder="Aziz"
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
                  <Label htmlFor="lastName">Familya</Label>
                  <Input
                    id="lastName"
                    placeholder="Karimov"
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

              <div className="space-y-1.5">
                <Label>Bo&apos;lim</Label>
                <Controller
                  name="sectionId"
                  control={control}
                  rules={{ required: "Bo'limni tanlang" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Bo'limni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {columnsWithSections.map((column) => (
                          <SelectGroup key={column.id}>
                            <SelectLabel>{column.name}</SelectLabel>
                            {column.sections.map((section) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.sectionId && (
                  <p className="text-sm text-destructive">
                    {errors.sectionId.message}
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
                    id="add-lead-sourceId"
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
        )}

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeAddLead}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button
              type="submit"
              form="add-lead-form"
              disabled={submitting || !sectionsExist}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
