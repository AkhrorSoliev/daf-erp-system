"use client";

import { useForm, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PriceInput } from "@/components/ui/price-input";
import type { Course } from "@/data/courses-model";

interface EditCourseFormProps {
  course: Course | null;
  onClose: () => void;
  formId: string;
}

export function EditCourseForm({ course, onClose, formId }: EditCourseFormProps) {
  const form = useForm({
    defaultValues: {
      name: course?.name ?? "",
      description: course?.description ?? "",
      course_duration: course?.course_duration ?? 3,
      lesson_duration: course?.lesson_duration ?? 36,
      price: course ? String(course.price) : "",
      is_enabled: course?.is_enabled ?? true,
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
          Kurs ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Kurs nomi</Label>
          <Input
            id="name"
            placeholder="Kurs nomi"
            {...form.register("name")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Tavsif</Label>
          <Textarea
            id="description"
            placeholder="Kurs haqida qisqacha ma'lumot"
            rows={3}
            {...form.register("description")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="course_duration">Davomiyligi (oy)</Label>
            <Input
              id="course_duration"
              type="number"
              min={1}
              placeholder="3"
              {...form.register("course_duration", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lesson_duration">Darslar soni</Label>
            <Input
              id="lesson_duration"
              type="number"
              min={1}
              placeholder="36"
              {...form.register("lesson_duration", { valueAsNumber: true })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Narxi</Label>
          <Controller
            control={form.control}
            name="price"
            render={({ field }) => (
              <PriceInput
                value={field.value}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Holati</p>
            <p className="text-xs text-muted-foreground">
              Kurs faol yoki nofaol
            </p>
          </div>
          <Switch
            checked={form.watch("is_enabled")}
            onCheckedChange={(checked) => form.setValue("is_enabled", checked)}
          />
        </div>
      </section>
    </form>
  );
}
