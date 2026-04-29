"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface ChangePasswordDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordDrawer({
  open,
  onClose,
}: ChangePasswordDrawerProps) {
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    if (values.newPassword !== values.confirmPassword) {
      form.setError("confirmPassword", {
        message: "Parollar mos kelmaydi",
      });
      return;
    }

    setSaving(true);
    try {
      await api.patch("/users/password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
      handleClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Parolni o'zgartirishda xatolik"));
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    form.reset();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Parolni o&apos;zgartirish</SheetTitle>
          <SheetDescription>
            Yangi parol kamida 6 ta belgidan iborat bo&apos;lishi kerak
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form
            id="change-password-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col"
          >
            <section className="space-y-5 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="oldPassword">Joriy parol</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  placeholder="Joriy parolingizni kiriting"
                  {...form.register("oldPassword", {
                    required: "Joriy parol kiritilishi shart",
                  })}
                />
                {form.formState.errors.oldPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.oldPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Yangi parol</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Yangi parolni kiriting"
                  {...form.register("newPassword", {
                    required: "Yangi parol kiritilishi shart",
                    minLength: {
                      value: 6,
                      message: "Kamida 6 ta belgi bo'lishi kerak",
                    },
                  })}
                />
                {form.formState.errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Parolni tasdiqlash</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Yangi parolni qayta kiriting"
                  {...form.register("confirmPassword", {
                    required: "Parolni tasdiqlash shart",
                  })}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </section>
          </form>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Bekor qilish
            </Button>
            <Button
              type="submit"
              form="change-password-form"
              disabled={saving}
            >
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              O&apos;zgartirish
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
