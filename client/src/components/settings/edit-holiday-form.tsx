"use client";

import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface EditHolidayFormProps {
  holiday: Holiday | null;
  onClose: () => void;
  onSaved?: (holiday: Holiday) => void;
  formId: string;
  isAdd?: boolean;
}

interface FormValues {
  name: string;
  date: Date | null;
  endDate: Date | null;
}

function mapHoliday(data: {
  id: string;
  name: string;
  date: string;
  endDate: string;
}): Holiday {
  return {
    id: data.id,
    name: data.name,
    date: data.date,
    endDate: data.endDate,
  };
}

export function EditHolidayForm({
  holiday,
  onClose,
  onSaved,
  formId,
  isAdd,
}: EditHolidayFormProps) {
  const setSubmitting = useEditHoliday((s) => s.setSubmitting);

  const form = useForm<FormValues>({
    defaultValues: {
      name: holiday?.name ?? "",
      date: holiday?.date ? new Date(holiday.date) : null,
      endDate: holiday?.endDate ? new Date(holiday.endDate) : null,
    },
  });

  const startDate = form.watch("date");
  const endDate = form.watch("endDate");

  const onSubmit = async (values: FormValues) => {
    if (!values.date) {
      form.setError("date", {
        type: "required",
        message: "Sana tanlanishi shart",
      });
      return;
    }

    if (values.endDate && values.endDate < values.date) {
      form.setError("endDate", {
        type: "invalid",
        message: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas",
      });
      return;
    }

    const startStr = format(values.date, "yyyy-MM-dd");
    const endStr = values.endDate
      ? format(values.endDate, "yyyy-MM-dd")
      : null;

    const payload: { name: string; date: string; endDate?: string } = {
      name: values.name.trim(),
      date: startStr,
    };
    if (endStr && endStr !== startStr) {
      payload.endDate = endStr;
    }

    setSubmitting(true);
    try {
      if (isAdd) {
        const { data } = await api.post("/holidays", payload);
        toast.success("Bayram muvaffaqiyatli qo'shildi");
        onSaved?.(mapHoliday(data));
      } else {
        if (!holiday) return;
        const { data } = await api.patch(`/holidays/${holiday.id}`, payload);
        toast.success("Bayram muvaffaqiyatli yangilandi");
        onSaved?.(mapHoliday(data));
      }
      onClose();
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          isAdd
            ? "Bayram qo'shishda xatolik yuz berdi"
            : "Bayramni yangilashda xatolik yuz berdi",
        ),
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
          Bayram ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Bayram nomi</Label>
          <Input
            id="name"
            placeholder="Masalan: Mustaqillik kuni"
            {...form.register("name", {
              required: "Bayram nomi kiritilishi shart",
              maxLength: { value: 200, message: "200 belgidan oshmasligi kerak" },
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Boshlanish sanasi</Label>
            <Controller
              name="date"
              control={form.control}
              rules={{ required: "Sana tanlanishi shart" }}
              render={({ field }) => (
                <DatePicker
                  id="date"
                  value={field.value}
                  onChange={(d) => field.onChange(d ?? null)}
                  placeholder="Sanani tanlang"
                  maxDate={endDate ?? undefined}
                  defaultMonth={endDate ?? undefined}
                />
              )}
            />
            {form.formState.errors.date && (
              <p className="text-sm text-destructive">
                {form.formState.errors.date.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate">Tugash sanasi (ixtiyoriy)</Label>
            <Controller
              name="endDate"
              control={form.control}
              render={({ field }) => (
                <DatePicker
                  id="endDate"
                  value={field.value}
                  onChange={(d) => field.onChange(d ?? null)}
                  placeholder="Bir kunlik bayram"
                  minDate={startDate ?? undefined}
                  defaultMonth={startDate ?? undefined}
                />
              )}
            />
            {form.formState.errors.endDate && (
              <p className="text-sm text-destructive">
                {form.formState.errors.endDate.message}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Bayram bir necha kun davom etsa, tugash sanasini tanlang. Bir kunlik
          bayram uchun tugash sanasini bo&apos;sh qoldiring.
        </p>
      </section>
    </form>
  );
}
