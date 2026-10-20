"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { ruleMessage } from "@/components/settings/settings-form-parts";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { MockExamParticipant } from "./exam-detail-types";
import { StudentLinkPicker } from "./student-link-picker";
import { identityAfterLink, type LinkableStudent } from "./student-link";

interface ManualParticipantDialogProps {
  examId: string;
  /** CEFR levels the exam offers (empty = hide the level picker). */
  offeredLevels: string[];
  /** Exam time slots offered (empty = hide the time picker). */
  examTimes: string[];
  /** Whether the exam has a discounted DaF-student price (shows a hint). */
  hasStudentDiscount: boolean;
  open: boolean;
  onClose: () => void;
  onAdded: (participant: MockExamParticipant) => void;
}

interface FormValues {
  firstName: string;
  lastName: string;
  phone: string;
  /** Chosen level ("" = none). */
  level: string;
  /** Chosen exam time ("" = none). */
  examTime: string;
}

const EMPTY_FORM: FormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  level: "",
  examTime: "",
};

// Rule messages stay Uzbek in the form state; drawn with `ruleMessage(t, …)`.
const FIRST_NAME_REQUIRED = msg("Ismni kiriting");
const LAST_NAME_REQUIRED = msg("Familiyani kiriting");
const NAME_TOO_LONG = msg("100 belgi chegarasi");
const PHONE_REQUIRED = msg("Telefon raqamini kiriting");
const PHONE_PATTERN = msg("9 ta raqamdan iborat bo'lishi kerak");

export function ManualParticipantDialog({
  examId,
  offeredLevels,
  examTimes,
  hasStudentDiscount,
  open,
  onClose,
  onAdded,
}: ManualParticipantDialogProps) {
  const t = useT();
  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  // Markaz o'quvchisi tanlansa, ishtirokchi aynan shu kartaga bog'lanadi —
  // telefon kartadagidan farq qilsa ham (masalan, ota-onaning raqami).
  const [linkedStudent, setLinkedStudent] = useState<LinkableStudent | null>(
    null,
  );

  useEffect(() => {
    if (open) {
      reset(EMPTY_FORM);
      setLinkedStudent(null);
      setSubmitting(false);
    }
  }, [open, reset]);

  function handleLinkChange(next: LinkableStudent | null) {
    const { firstName, lastName, phone } = getValues();
    const identity = identityAfterLink(
      { firstName, lastName, phone },
      linkedStudent,
      next,
    );
    const opts = { shouldValidate: next !== null, shouldDirty: true };
    setValue("firstName", identity.firstName, opts);
    setValue("lastName", identity.lastName, opts);
    setValue("phone", identity.phone, opts);
    setLinkedStudent(next);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const { data } = await api.post<MockExamParticipant>(
        `/mock-exams/${examId}/participants/manual`,
        {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          phone: values.phone,
          studentId: linkedStudent?.id,
          level: values.level || undefined,
          examTime: values.examTime || undefined,
        },
      );
      onAdded(data);
      toast.success(t("Ishtirokchi qo'shildi"));
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Qo'shishda xatolik yuz berdi")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("Ishtirokchini qo'lda qo'shish")}</DialogTitle>
          <DialogDescription>
            {t(
              "Telegram botidan o'tmagan ishtirokchini qo'lda yozish. Bunday ishtirokchiga natija Telegramda avtomatik yuborilmaydi.",
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          id="manual-participant-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-4 overflow-y-auto px-6 py-4"
        >
          <div className="space-y-1.5">
            <Label>{t("Markaz o'quvchisi (ixtiyoriy)")}</Label>
            <StudentLinkPicker
              value={linkedStudent}
              onChange={handleLinkChange}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {hasStudentDiscount
                ? t(
                    "Ishtirokchi markazimiz o'quvchisi bo'lsa, uni tanlang: ism va telefon kartadan olinadi, DaF chegirmasi qo'llanadi (chetlatilgan va arxivdagilardan tashqari).",
                  )
                : t(
                    "Ishtirokchi markazimiz o'quvchisi bo'lsa, uni tanlang: ism va telefon kartadan olinadi, natijasi o'quvchi profilida ko'rinadi.",
                  )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-firstName">{t("Ism")}</Label>
              <Input
                id="manual-firstName"
                placeholder="Aziz"
                {...register("firstName", {
                  required: FIRST_NAME_REQUIRED,
                  maxLength: { value: 100, message: NAME_TOO_LONG },
                })}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">
                  {ruleMessage(t, errors.firstName.message)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-lastName">{t("Familiya")}</Label>
              <Input
                id="manual-lastName"
                placeholder="Karimov"
                {...register("lastName", {
                  required: LAST_NAME_REQUIRED,
                  maxLength: { value: 100, message: NAME_TOO_LONG },
                })}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">
                  {ruleMessage(t, errors.lastName.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("Telefon raqami")}</Label>
            <Controller
              name="phone"
              control={control}
              rules={{
                required: PHONE_REQUIRED,
                pattern: {
                  value: /^\d{9}$/,
                  message: PHONE_PATTERN,
                },
              }}
              render={({ field }) => (
                <PhoneInput
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">
                {ruleMessage(t, errors.phone.message)}
              </p>
            )}
            {!linkedStudent && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Raqam markaz o'quvchisining kartasidagi raqam bo'lsa, o'quvchi avtomatik bog'lanadi.",
                )}
              </p>
            )}
          </div>

          {offeredLevels.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("Daraja (ixtiyoriy)")}</Label>
              <Controller
                name="level"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {offeredLevels.map((lvl) => {
                      const active = field.value === lvl;
                      return (
                        <Button
                          key={lvl}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => field.onChange(active ? "" : lvl)}
                          className="w-14 tabular-nums"
                        >
                          {lvl}
                        </Button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
          )}

          {examTimes.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("Vaqt (ixtiyoriy)")}</Label>
              <Controller
                name="examTime"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {examTimes.map((time) => {
                      const active = field.value === time;
                      return (
                        <Button
                          key={time}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => field.onChange(active ? "" : time)}
                          className="tabular-nums"
                        >
                          🕐 {time}
                        </Button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
          )}
        </form>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button
            type="submit"
            form="manual-participant-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("Qo'shish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
