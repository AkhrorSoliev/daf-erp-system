"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { MockExamSummary } from "@/hooks/use-mock-exams-board";
import { LevelMultiSelect } from "./level-multiselect";
import { ExamTimesEditor } from "./exam-times-editor";

const WORK_START = "07:00";
const WORK_END = "22:00";

interface ExamDetail extends MockExamSummary {
  section: { id: string; name: string; color: string | null };
}

interface EditExamDrawerProps {
  exam: ExamDetail | null;
  onClose: () => void;
  onSaved: (exam: ExamDetail) => void;
}

interface FormValues {
  title: string;
  description: string;
  examDate: Date | null;
  examTimes: string[];
  registrationDate: Date | null;
  registrationTime: string;
  price: string;
  studentPrice: string;
  offeredLevels: string[];
}

function buildDateTime(date: Date | null, time: string): string | null {
  if (!date) return null;
  const [hStr, mStr] = (time || "00:00").split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out.toISOString();
}

function splitDateTime(
  iso: string | null,
  defaultTime: string,
): { date: Date | null; time: string } {
  if (!iso) return { date: null, time: defaultTime };
  const d = new Date(iso);
  return {
    date: d,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`,
  };
}

export function EditExamDrawer({
  exam,
  onClose,
  onSaved,
}: EditExamDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: "",
      description: "",
      examDate: null,
      examTimes: ["10:00"],
      registrationDate: null,
      registrationTime: "18:00",
      price: "",
      studentPrice: "",
      offeredLevels: [],
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const open = !!exam;

  useEffect(() => {
    if (exam) {
      const examParts = splitDateTime(exam.examDate, "10:00");
      const regParts = splitDateTime(exam.registrationDeadline, "18:00");
      reset({
        title: exam.title,
        description: exam.description ?? "",
        examDate: examParts.date,
        // Fall back to the primary examDate time for legacy exams that have
        // no explicit examTimes list yet.
        examTimes:
          exam.examTimes && exam.examTimes.length > 0
            ? exam.examTimes
            : [examParts.time],
        registrationDate: regParts.date,
        registrationTime: regParts.time,
        price: exam.price > 0 ? String(exam.price) : "",
        studentPrice:
          exam.studentPrice != null ? String(exam.studentPrice) : "",
        offeredLevels: exam.offeredLevels ?? [],
      });
      setSubmitting(false);
    }
  }, [exam, reset]);

  async function onSubmit(values: FormValues) {
    if (!exam) return;

    const price = values.price.trim() ? Number(values.price) : 0;
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Narx noto'g'ri kiritildi");
      return;
    }

    // Empty DaF price clears the discount (send null); otherwise validate.
    let studentPrice: number | null = null;
    if (values.studentPrice.trim()) {
      const sp = Number(values.studentPrice);
      if (!Number.isFinite(sp) || sp < 0) {
        toast.error("DaF o'quvchi narxi noto'g'ri kiritildi");
        return;
      }
      studentPrice = sp;
    }

    const examTimes = [...new Set(values.examTimes.filter(Boolean))].sort();
    if (examTimes.length === 0) {
      toast.error("Kamida 1 ta imtihon vaqtini qo'shing");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        examDate: buildDateTime(values.examDate, examTimes[0]),
        registrationDeadline: buildDateTime(
          values.registrationDate,
          values.registrationTime,
        ),
        price,
        studentPrice,
        offeredLevels: values.offeredLevels,
        examTimes,
      };

      const { data } = await api.patch<ExamDetail>(
        `/mock-exams/${exam.id}`,
        payload,
      );
      onSaved(data);
      toast.success("Imtihon yangilandi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Imtihonni tahrirlash</SheetTitle>
          <SheetDescription>
            Barcha maydonlarni o&apos;zgartirish mumkin. Ishtirokchi bo&apos;lsa,
            forma o&apos;zgarishi ularning javoblariga ta&apos;sir qilmaydi.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form
            id="edit-exam-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5 px-6 py-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Imtihon nomi</Label>
              <Input
                id="edit-title"
                {...register("title", {
                  required: "Nom kiritilishi shart",
                  maxLength: { value: 200, message: "200 belgi chegarasi" },
                })}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Tavsif</Label>
              <Textarea
                id="edit-description"
                rows={3}
                maxLength={2000}
                {...register("description")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Imtihon sanasi</Label>
              <Controller
                name="examDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={(d) => field.onChange(d ?? null)}
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Imtihon vaqtlari</Label>
              <Controller
                name="examTimes"
                control={control}
                render={({ field }) => (
                  <ExamTimesEditor
                    value={field.value}
                    onChange={field.onChange}
                    minTime={WORK_START}
                    maxTime={WORK_END}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Bir nechta vaqt = botda tanlov. Birinchisi asosiy sana-vaqt.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Ro&apos;yxatga olish muddati</Label>
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="registrationDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value}
                      onChange={(d) => field.onChange(d ?? null)}
                    />
                  )}
                />
                <Controller
                  name="registrationTime"
                  control={control}
                  render={({ field }) => (
                    <TimePicker
                      value={field.value}
                      onChange={field.onChange}
                      minTime={WORK_START}
                      maxTime={WORK_END}
                    />
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-price">Narxi</Label>
              <Controller
                name="price"
                control={control}
                render={({ field }) => (
                  <PriceInput
                    id="edit-price"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="0 = bepul"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-student-price">
                DaF o&apos;quvchi narxi (ixtiyoriy)
              </Label>
              <Controller
                name="studentPrice"
                control={control}
                render={({ field }) => (
                  <PriceInput
                    id="edit-student-price"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="Bo'sh = to'liq narx"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Markaz o&apos;quvchilariga chegirmali narx.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Taklif etiladigan darajalar</Label>
              <Controller
                name="offeredLevels"
                control={control}
                render={({ field }) => (
                  <LevelMultiSelect
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Botda tugma sifatida chiqadi; foydalanuvchi bittasini tanlaydi.
              </p>
            </div>
          </form>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="submit" form="edit-exam-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Saqlash
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
