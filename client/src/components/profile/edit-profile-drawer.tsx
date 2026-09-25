"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Camera, Trash2 } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { describeSaveFailure, isPhoneChanged, planProfileSave } from "./profile-save-plan";

interface EditProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  firstName: string;
  lastName: string;
  phone: string;
  currentPassword: string;
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function EditProfileDrawer({ open, onClose }: EditProfileDrawerProps) {
  const { user, setAuth } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    values: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      phone: user?.phone ?? "",
      currentPassword: "",
    },
    // A saved phone updates the session, which feeds `values` again; keep
    // what the person typed in the other fields instead of resetting them.
    resetOptions: { keepDirtyValues: true },
  });

  if (!user) return null;

  const phoneChanged = isPhoneChanged(user.phone, form.watch("phone"));
  const fullName = `${user.firstName} ${user.lastName}`;
  const displayPhoto = photoRemoved ? null : (previewPhoto ?? user.photo);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setPreviewPhoto(previewUrl);

    setPhotoRemoved(false);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<{ url: string }>("/upload", formData);
      setPreviewPhoto(data.url);
    } catch {
      toast.error("Rasm yuklashda xatolik yuz berdi");
      setPreviewPhoto(null);
    } finally {
      setUploading(false);
    }
  }

  function handleRemovePhoto() {
    setPreviewPhoto(null);
    setPhotoRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateSession(changes: Partial<AuthUser>) {
    const token = readCookie("token");
    const refreshToken = readCookie("refreshToken");
    if (token && refreshToken) {
      setAuth({ ...user!, ...changes }, token, refreshToken);
    }
  }

  async function onSubmit(values: FormValues) {
    const plan = planProfileSave({ user: user!, values, previewPhoto, photoRemoved });
    if (!plan.phone && !plan.profile) {
      onClose();
      return;
    }

    setSaving(true);
    let saved: Partial<AuthUser> = {};
    try {
      // The phone goes first: it is the step that can be refused (a wrong
      // password), and a refusal then leaves nothing else half-saved.
      if (plan.phone) {
        const { data } = await api.patch("/users/phone", plan.phone);
        saved = { ...saved, ...data };
      }
      if (plan.profile) {
        const { data } = await api.patch("/users/profile", plan.profile);
        saved = { ...saved, ...data };
      }
      toast.success("Profil muvaffaqiyatli yangilandi");
      setPreviewPhoto(null);
      onClose();
    } catch (error) {
      toast.error(
        describeSaveFailure({
          phoneSaved: saved.phone !== undefined,
          reason: getErrorMessage(error, "Profilni yangilashda xatolik yuz berdi"),
        }),
      );
    } finally {
      // Whatever the server accepted is real, even if a later step failed.
      if (Object.keys(saved).length > 0) updateSession(saved);
      setSaving(false);
    }
  }

  function handleClose() {
    setPreviewPhoto(null);
    setPhotoRemoved(false);
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
          <SheetTitle className="text-lg">Profilni tahrirlash</SheetTitle>
          <SheetDescription>
            Shaxsiy ma&apos;lumotlaringizni o&apos;zgartiring
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form
            id="edit-profile-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col"
          >
            {/* Rasm yuklash */}
            <section className="space-y-5 px-6 py-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Profil rasmi
              </h3>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar key={displayPhoto ?? "empty"} className="size-20">
                    <AvatarImage src={displayPhoto ?? undefined} alt={fullName} />
                    <AvatarFallback className="text-2xl font-semibold">
                      {getInitials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Camera className="size-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>JPG, PNG yoki WebP formatda</p>
                  <p>Maksimal 5 MB</p>
                  {uploading && (
                    <p className="text-primary">Yuklanmoqda...</p>
                  )}
                  {displayPhoto && !uploading && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="mt-1 flex items-center gap-1 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="size-3" />
                      Rasmni o&apos;chirish
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Shaxsiy ma'lumotlar */}
            <section className="space-y-5 px-6 py-5 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Shaxsiy ma&apos;lumotlar
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Ism</Label>
                  <Input
                    id="firstName"
                    placeholder="Ism"
                    {...form.register("firstName", {
                      required: "Ism kiritilishi shart",
                    })}
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Familiya</Label>
                  <Input
                    id="lastName"
                    placeholder="Familiya"
                    {...form.register("lastName", {
                      required: "Familiya kiritilishi shart",
                    })}
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon raqam</Label>
                <Controller
                  name="phone"
                  control={form.control}
                  rules={{
                    validate: (value) =>
                      !isPhoneChanged(user.phone, value) ||
                      /^\d{9}$/.test(value) ||
                      "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
                  }}
                  render={({ field }) => (
                    <PhoneInput
                      id="phone"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {form.formState.errors.phone && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>

              {phoneChanged && (
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Joriy parol</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Joriy parolingiz"
                    {...form.register("currentPassword", {
                      validate: (value) =>
                        !isPhoneChanged(user.phone, form.getValues("phone")) ||
                        value.length > 0 ||
                        "Joriy parolni kiriting",
                    })}
                  />
                  {form.formState.errors.currentPassword ? (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.currentPassword.message}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Raqamni o&apos;zgartirish uchun joriy parolingizni kiriting.
                    </p>
                  )}
                </div>
              )}
            </section>
          </form>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Bekor qilish
            </Button>
            <Button
              type="submit"
              form="edit-profile-form"
              disabled={saving || uploading}
            >
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
