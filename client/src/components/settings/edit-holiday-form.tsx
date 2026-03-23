"use client";

import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Holiday } from "@/hooks/use-edit-holiday";

interface EditHolidayFormProps {
  holiday: Holiday;
  onClose: () => void;
  formId: string;
}

export function EditHolidayForm({ holiday, onClose, formId }: EditHolidayFormProps) {
  const form = useForm({
    defaultValues: {
      name: holiday.name,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
    },
  });

  const onSubmit = () => {
    onClose();
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
            placeholder="Bayram nomi"
            {...form.register("name")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Boshlanish sanasi</Label>
            <Input
              id="startDate"
              placeholder="01.01.2026"
              {...form.register("startDate")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endDate">Tugash sanasi</Label>
            <Input
              id="endDate"
              placeholder="03.01.2026"
              {...form.register("endDate")}
            />
          </div>
        </div>
      </section>
    </form>
  );
}
