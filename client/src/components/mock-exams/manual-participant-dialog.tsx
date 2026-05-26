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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { MockExamParticipant } from "./exam-detail-types";

interface ManualParticipantDialogProps {
  examId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (participant: MockExamParticipant) => void;
}

interface FormValues {
  firstName: string;
  lastName: string;
  phone: string;
}

export function ManualParticipantDialog({
  examId,
  open,
  onClose,
  onAdded,
}: ManualParticipantDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { firstName: "", lastName: "", phone: "" },
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ firstName: "", lastName: "", phone: "" });
      setSubmitting(false);
    }
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const { data } = await api.post<MockExamParticipant>(
        `/mock-exams/${examId}/participants/manual`,
        {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          phone: values.phone,
        },
      );
      onAdded(data);
      toast.success("Ishtirokchi qo'shildi");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Qo'shishda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ishtirokchini qo&apos;lda qo&apos;shish</DialogTitle>
          <DialogDescription>
            Telegram orqali ro&apos;yxatga olinmagan ishtirokchini qo&apos;lda
            yozish. Botdan farqli ravishda Telegram chat ID bo&apos;lmaydi,
            shuning uchun bunday ishtirokchiga natija avtomatik yuborilmaydi.
          </DialogDescription>
        </DialogHeader>

        <form
          id="manual-participant-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-firstName">Ism</Label>
              <Input
                id="manual-firstName"
                placeholder="Aziz"
                {...register("firstName", {
                  required: "Ismni kiriting",
                  maxLength: { value: 100, message: "100 belgi chegarasi" },
                })}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-lastName">Familya</Label>
              <Input
                id="manual-lastName"
                placeholder="Karimov"
                {...register("lastName", {
                  required: "Familyani kiriting",
                  maxLength: { value: 100, message: "100 belgi chegarasi" },
                })}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">
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
                required: "Telefon raqamini kiriting",
                pattern: {
                  value: /^\d{9}$/,
                  message: "9 ta raqamdan iborat bo'lishi kerak",
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
                {errors.phone.message}
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            form="manual-participant-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Qo&apos;shish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
