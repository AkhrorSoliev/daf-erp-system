"use client";

import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  useMockExamsBoard,
  type MockExamRow,
} from "@/hooks/use-mock-exams-board";
import { LevelMultiSelect } from "./level-multiselect";

// O'quv markaz ish soatlari (attendance-reminder cron'iga mos: 07:00–22:00).
// TimePicker filterFix shu oraliqdagi 30-daqiqalik slotlarni qoldiradi.
const WORK_START = "07:00";
const WORK_END = "22:00";

export interface CreateExamPrefill {
  sectionId: string | null;
}

interface CreateExamDrawerProps {
  open: boolean;
  prefill: CreateExamPrefill;
  onClose: () => void;
}

interface SubjectRow {
  name: string;
  /** Raw string from the input; converted to Number on submit. */
  maxScore: string;
  /** Per-subject pass threshold; bo'sh bo'lsa null jo'natiladi. */
  passingScore: string;
}

interface FormValues {
  title: string;
  description: string;
  examDate: Date | null;
  examTime: string;
  registrationDate: Date | null;
  registrationTime: string;
  /** Raw digits — PriceInput strips separators internally. */
  price: string;
  /** Discounted price for DaF students; empty = they pay the full price. */
  studentPrice: string;
  /** CEFR levels offered (empty = no level step in the bot). */
  offeredLevels: string[];
  subjects: SubjectRow[];
}

const DEFAULT_SUBJECT_ROW: SubjectRow = {
  name: "",
  maxScore: "100",
  passingScore: "60",
};

// DaF Sprachzentrum standart 4 nemis tili bo'limi (Goethe B1+ modular
// formati: har bo'lim 100 dan, o'tish 60). Har imtihon yaratilganda
// boshlang'ich holat sifatida ko'rsatiladi. Admin keraksizini o'chirib,
// ballarni moslay oladi.
const DEFAULT_GERMAN_SUBJECTS: SubjectRow[] = [
  { name: "Lesen", maxScore: "100", passingScore: "60" },
  { name: "Hören", maxScore: "100", passingScore: "60" },
  { name: "Schreiben", maxScore: "100", passingScore: "60" },
  { name: "Sprechen", maxScore: "100", passingScore: "60" },
];

function buildDateTime(date: Date | null, time: string): string | undefined {
  if (!date) return undefined;
  const [hStr, mStr] = (time || "00:00").split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out.toISOString();
}

export function CreateExamDrawer({
  open,
  prefill,
  onClose,
}: CreateExamDrawerProps) {
  const addExam = useMockExamsBoard((s) => s.addExam);

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
      examTime: "10:00",
      registrationDate: null,
      registrationTime: "09:00",
      price: "",
      studentPrice: "",
      offeredLevels: [],
      subjects: DEFAULT_GERMAN_SUBJECTS.map((s) => ({ ...s })),
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "subjects",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      reset({
        title: "",
        description: "",
        examDate: null,
        examTime: "10:00",
        registrationDate: null,
        registrationTime: "09:00",
        price: "",
        studentPrice: "",
        offeredLevels: [],
        subjects: DEFAULT_GERMAN_SUBJECTS.map((s) => ({ ...s })),
      });
      setSubmitting(false);
    }
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    if (!values.examDate) {
      toast.error("Imtihon sanasini tanlang");
      return;
    }

    const examDt = buildDateTime(values.examDate, values.examTime);
    const regDt = buildDateTime(values.registrationDate, values.registrationTime);
    if (examDt && regDt && new Date(regDt) > new Date(examDt)) {
      toast.error(
        "Ro'yxatga olish muddati imtihon sanasi va vaqtidan oldin bo'lishi kerak",
      );
      return;
    }

    const price = values.price.trim() ? Number(values.price) : 0;
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Narx noto'g'ri kiritildi");
      return;
    }

    let studentPrice: number | undefined;
    if (values.studentPrice.trim()) {
      const sp = Number(values.studentPrice);
      if (!Number.isFinite(sp) || sp < 0) {
        toast.error("DaF o'quvchi narxi noto'g'ri kiritildi");
        return;
      }
      studentPrice = sp;
    }

    const subjects: {
      name: string;
      maxScore: number;
      passingScore?: number;
    }[] = [];
    for (let i = 0; i < values.subjects.length; i++) {
      const s = values.subjects[i];
      const name = s.name.trim();
      const maxScore = Number(s.maxScore);
      if (!name) {
        toast.error(`Bo'lim #${i + 1} nomini kiriting`);
        return;
      }
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        toast.error(`"${name}" bo'limining balli 0 dan katta bo'lishi kerak`);
        return;
      }
      const rawPass = s.passingScore.trim();
      let passingScore: number | undefined;
      if (rawPass) {
        const n = Number(rawPass);
        if (!Number.isFinite(n) || n < 0) {
          toast.error(
            `"${name}" bo'limining o'tish balli 0 dan kichik bo'la olmaydi`,
          );
          return;
        }
        if (n > maxScore) {
          toast.error(
            `"${name}" bo'limi: o'tish balli (${n}) maksimaldan (${maxScore}) katta bo'la olmaydi`,
          );
          return;
        }
        passingScore = n;
      }
      subjects.push({
        name,
        maxScore,
        ...(passingScore !== undefined ? { passingScore } : {}),
      });
    }
    if (subjects.length === 0) {
      toast.error("Kamida 1 ta bo'lim qo'shing");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post<MockExamRow>("/mock-exams", {
        // sectionId omitted — backend auto-picks the default section.
        sectionId: prefill.sectionId ?? undefined,
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        examDate: examDt,
        registrationDeadline: regDt,
        price,
        studentPrice,
        offeredLevels: values.offeredLevels,
        subjects,
      });
      addExam(data);
      toast.success("Imtihon yaratildi");
      onClose();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Imtihon yaratishda xatolik yuz berdi"),
      );
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
          <SheetTitle className="text-lg">Yangi mock imtihon</SheetTitle>
          <SheetDescription>
            Sana va soat, narxni belgilang. Boshqa parametrlarni keyin
            sozlash mumkin.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form
            id="create-exam-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5 px-6 py-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="title">Imtihon nomi</Label>
              <Input
                id="title"
                placeholder="Masalan: IELTS Mock — Yanvar 2026"
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
              <Label htmlFor="description">Tavsif (ixtiyoriy)</Label>
              <Textarea
                id="description"
                placeholder="Imtihon haqida qo'shimcha ma'lumot"
                rows={3}
                maxLength={2000}
                {...register("description")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Imtihon sanasi va soati</Label>
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="examDate"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value}
                      onChange={(d) => field.onChange(d ?? null)}
                    />
                  )}
                />
                <Controller
                  name="examTime"
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
              <p className="text-xs text-muted-foreground">
                Soatlar markaz ish vaqti oralig&apos;ida ({WORK_START}–
                {WORK_END})
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Ro&apos;yxatga olish muddati (ixtiyoriy)</Label>
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
              <p className="text-xs text-muted-foreground">
                Belgilangan vaqt kelganda ro&apos;yxat avtomatik yopiladi.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="price">Narxi</Label>
              <Controller
                name="price"
                control={control}
                render={({ field }) => (
                  <PriceInput
                    id="price"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="0 = bepul"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Click/Payme orqali ID&apos;ga to&apos;lanadi
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="studentPrice">
                DaF o&apos;quvchi narxi (ixtiyoriy)
              </Label>
              <Controller
                name="studentPrice"
                control={control}
                render={({ field }) => (
                  <PriceInput
                    id="studentPrice"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="Bo'sh = to'liq narx"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Markazimiz o&apos;quvchilariga chegirmali narx. Bo&apos;sh
                qoldirilsa, ular ham to&apos;liq narx to&apos;laydi.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Taklif etiladigan darajalar (ixtiyoriy)</Label>
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
                Tanlangan darajalar botda tugma sifatida chiqadi;
                ro&apos;yxatdan o&apos;tuvchi bittasini tanlaydi.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bo&apos;limlar va ballar</Label>
                <span className="text-xs text-muted-foreground">
                  Kamida 1 ta
                </span>
              </div>
              <div className="grid grid-cols-[1fr_5rem_5rem_2.25rem] gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Nom</span>
                <span className="text-center">Maks</span>
                <span className="text-center">O&apos;tish</span>
                <span></span>
              </div>
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div
                    key={f.id}
                    className="grid grid-cols-[1fr_5rem_5rem_2.25rem] items-start gap-2"
                  >
                    <Input
                      placeholder="Masalan: Hören"
                      maxLength={100}
                      {...register(`subjects.${idx}.name` as const, {
                        required: true,
                      })}
                    />
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      className="text-center"
                      inputMode="numeric"
                      {...register(`subjects.${idx}.maxScore` as const, {
                        required: true,
                      })}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="60"
                      className="text-center"
                      inputMode="numeric"
                      {...register(`subjects.${idx}.passingScore` as const)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                      title={
                        fields.length === 1
                          ? "Kamida 1 ta bo'lim qoldirish kerak"
                          : "O'chirish"
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...DEFAULT_SUBJECT_ROW })}
              >
                <Plus className="size-4" />
                Bo&apos;lim qo&apos;shish
              </Button>
              <p className="text-xs text-muted-foreground">
                Goethe B1+ modular formati: har bo&apos;lim 100 dan, o&apos;tish
                60. O&apos;tish balli ixtiyoriy.
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
          <Button type="submit" form="create-exam-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Yaratish
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
