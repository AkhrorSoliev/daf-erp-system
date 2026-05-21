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
import {
  useLeadsBoard,
  type LeadCard,
  type LeadSourceOption,
} from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

interface AddLeadValues {
  firstName: string;
  lastName: string;
  phone: string;
  sectionId: string;
  sourceId: string;
}

const EMPTY_VALUES: AddLeadValues = {
  firstName: "",
  lastName: "",
  phone: "",
  sectionId: "",
  sourceId: "",
};

export function AddLeadDrawer() {
  const { open, sectionId: presetSectionId } = useLeadsUi((s) => s.addLead);
  const closeAddLead = useLeadsUi((s) => s.closeAddLead);
  const board = useLeadsBoard((s) => s.board);
  const addLead = useLeadsBoard((s) => s.addLead);

  const [sources, setSources] = useState<LeadSourceOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [savingSource, setSavingSource] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AddLeadValues>({ defaultValues: EMPTY_VALUES });

  const columnsWithSections = board.filter((c) => c.sections.length > 0);
  const sectionsExist = columnsWithSections.length > 0;

  useEffect(() => {
    if (!open) return;
    reset({ ...EMPTY_VALUES, sectionId: presetSectionId ?? "" });
    setAddingSource(false);
    setNewSource("");
    setSubmitting(false);
    api
      .get<LeadSourceOption[]>("/lead-sources")
      .then(({ data }) => setSources(data))
      .catch((error) =>
        toast.error(getErrorMessage(error, "Manbalarni yuklashda xatolik")),
      );
  }, [open, presetSectionId, reset]);

  async function handleCreateSource() {
    const name = newSource.trim();
    if (!name) {
      toast.error("Manba nomini kiriting");
      return;
    }
    setSavingSource(true);
    try {
      const { data } = await api.post<LeadSourceOption>("/lead-sources", {
        name,
      });
      setSources((prev) => [...prev, data]);
      setValue("sourceId", data.id);
      setAddingSource(false);
      setNewSource("");
      toast.success("Manba qo'shildi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Manba qo'shishda xatolik"));
    } finally {
      setSavingSource(false);
    }
  }

  async function onSubmit(values: AddLeadValues) {
    setSubmitting(true);
    try {
      const { data } = await api.post<LeadCard>("/leads", {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone,
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

              <div className="space-y-1.5">
                <Label>Lid manbasi (ixtiyoriy)</Label>
                <Controller
                  name="sourceId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Manbani tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {addingSource ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      value={newSource}
                      onChange={(e) => setNewSource(e.target.value)}
                      placeholder="Yangi manba nomi"
                      maxLength={100}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateSource}
                      disabled={savingSource}
                    >
                      {savingSource && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Qo&apos;shish
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingSource(false)}
                      disabled={savingSource}
                    >
                      Bekor
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingSource(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    + Yangi manba qo&apos;shish
                  </button>
                )}
              </div>
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
