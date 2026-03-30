"use client";

import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PriceInput } from "@/components/ui/price-input";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

interface EditCourseFormProps {
  course: Course | null;
  onClose: () => void;
  onSaved?: (course: Course) => void;
  formId: string;
  isAdd?: boolean;
}

export function EditCourseForm({
  course,
  onClose,
  onSaved,
  formId,
  isAdd,
}: EditCourseFormProps) {
  const setSubmitting = useEditCourse((s) => s.setSubmitting);

  const form = useForm({
    defaultValues: {
      name: course?.name ?? "",
      description: course?.description ?? "",
      courseDuration: course?.courseDuration ?? (3 as number),
      lessonDuration: course?.lessonDuration ?? (36 as number),
      lessonMinutes: course?.lessonMinutes ?? (90 as number),
      price: course ? String(course.price) : "",
      isActive: course?.isActive ?? true,
    },
  });

  const onSubmit = async (values: {
    name: string;
    description: string;
    courseDuration: number;
    lessonDuration: number;
    lessonMinutes: number;
    price: string;
    isActive: boolean;
  }) => {
    setSubmitting(true);
    try {
      const priceNum = Number(String(values.price).replace(/\D/g, ""));

      if (isAdd) {
        const branchId = useBranchSwitcher.getState().selectedBranch?.id;
        const companyId = localStorage.getItem("companyId");

        const { data } = await api.post("/courses", {
          name: values.name,
          description: values.description || undefined,
          courseDuration: values.courseDuration || undefined,
          lessonDuration: values.lessonDuration || undefined,
          lessonMinutes: values.lessonMinutes || undefined,
          price: priceNum,
          branchId,
          companyId: companyId ? Number(companyId) : undefined,
        });

        const created: Course = {
          id: data.id,
          name: data.name,
          description: data.description,
          lessonDuration: data.lessonDuration,
          lessonMinutes: data.lessonMinutes,
          courseDuration: data.courseDuration,
          price: data.price,
          isActive: data.isActive,
          branchId: data.branchId,
        };

        toast.success("Yangi kurs muvaffaqiyatli qo'shildi");
        onSaved?.(created);
      } else {
        if (!course) return;
        const { data } = await api.patch(`/courses/${course.id}`, {
          name: values.name,
          description: values.description || undefined,
          courseDuration: values.courseDuration || undefined,
          lessonDuration: values.lessonDuration || undefined,
          lessonMinutes: values.lessonMinutes || undefined,
          price: priceNum,
          isActive: values.isActive,
        });

        const updated: Course = {
          id: data.id,
          name: data.name,
          description: data.description,
          lessonDuration: data.lessonDuration,
          lessonMinutes: data.lessonMinutes,
          courseDuration: data.courseDuration,
          price: data.price,
          isActive: data.isActive,
          branchId: data.branchId,
        };

        toast.success("Kurs muvaffaqiyatli yangilandi");
        onSaved?.(updated);
      }
      onClose();
    } catch {
      toast.error(
        isAdd
          ? "Kurs qo'shishda xatolik yuz berdi"
          : "Kursni yangilashda xatolik yuz berdi",
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
          Kurs ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Kurs nomi</Label>
          <Input
            id="name"
            placeholder="Kurs nomi"
            {...form.register("name", {
              required: "Kurs nomi kiritilishi shart",
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
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

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="courseDuration">Davomiyligi (oy)</Label>
            <Input
              id="courseDuration"
              type="number"
              min={1}
              placeholder="3"
              {...form.register("courseDuration", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lessonDuration">Darslar soni</Label>
            <Input
              id="lessonDuration"
              type="number"
              min={1}
              placeholder="36"
              {...form.register("lessonDuration", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lessonMinutes">Dars davomiyligi (daq)</Label>
            <Input
              id="lessonMinutes"
              type="number"
              min={1}
              placeholder="90"
              {...form.register("lessonMinutes", { valueAsNumber: true })}
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

        {!isAdd && (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Holati</p>
              <p className="text-xs text-muted-foreground">
                Kurs faol yoki nofaol
              </p>
            </div>
            <Switch
              checked={form.watch("isActive")}
              onCheckedChange={(checked) =>
                form.setValue("isActive", checked)
              }
            />
          </div>
        )}
      </section>
    </form>
  );
}
