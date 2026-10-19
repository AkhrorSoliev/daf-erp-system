"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
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
import { useAuth } from "@/hooks/use-auth";
import { freshSessionFrom } from "@/lib/fresh-session";
import { getErrorMessage } from "@/lib/get-error-message";
import { ruleMessage } from "@/components/settings/settings-form-parts";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

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
  const t = useT();
  const [saving, setSaving] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);

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
        message: msg("Parollar mos kelmaydi"),
      });
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch("/users/password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      // The change ended every session of this account, this device's too;
      // the API returns a fresh pair so only the other devices sign out.
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success(t("Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar tugatildi"));
      handleClose();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Parolni o'zgartirishda xatolik")));
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
          <SheetTitle className="text-lg">{t("Parolni o'zgartirish")}</SheetTitle>
          <SheetDescription>
            {t("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak")}
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
                <Label htmlFor="oldPassword">{t("Joriy parol")}</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  placeholder={t("Joriy parolingizni kiriting")}
                  {...form.register("oldPassword", {
                    required: msg("Joriy parol kiritilishi shart"),
                  })}
                />
                {form.formState.errors.oldPassword && (
                  <p className="text-sm text-destructive">
                    {ruleMessage(t, form.formState.errors.oldPassword.message)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t("Yangi parol")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder={t("Yangi parolni kiriting")}
                  {...form.register("newPassword", {
                    required: msg("Yangi parol kiritilishi shart"),
                    minLength: {
                      value: 6,
                      message: msg("Kamida 6 ta belgi bo'lishi kerak"),
                    },
                  })}
                />
                {form.formState.errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {ruleMessage(t, form.formState.errors.newPassword.message)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t("Parolni tasdiqlash")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t("Yangi parolni qayta kiriting")}
                  {...form.register("confirmPassword", {
                    required: msg("Parolni tasdiqlash shart"),
                  })}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {ruleMessage(t, form.formState.errors.confirmPassword.message)}
                  </p>
                )}
              </div>
            </section>
          </form>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("Bekor qilish")}
            </Button>
            <Button type="submit" form="change-password-form" disabled={saving}>
              {saving ? t("Saqlanmoqda...") : t("O'zgartirish")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
