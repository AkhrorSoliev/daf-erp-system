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
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";

interface EditProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  phone: string;
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
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });

  if (!user) return null;

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

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};

      if (values.name !== user!.name) payload.name = values.name;
      if (values.phone !== (user!.phone ?? "")) payload.phone = values.phone;
      if (photoRemoved) {
        payload.photo = "";
      } else if (previewPhoto && previewPhoto !== user!.photo) {
        payload.photo = previewPhoto;
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      const { data: updatedUser } = await api.patch("/users/profile", payload);

      // Update auth state with new user data
      const token = document.cookie
        .split("; ")
        .find((c) => c.startsWith("token="))
        ?.split("=")[1];
      const refreshToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("refreshToken="))
        ?.split("=")[1];

      if (token && refreshToken) {
        setAuth(
          { ...user!, ...updatedUser },
          token,
          refreshToken,
        );
      }

      toast.success("Profil muvaffaqiyatli yangilandi");
      setPreviewPhoto(null);
      onClose();
    } catch {
      toast.error("Profilni yangilashda xatolik yuz berdi");
    } finally {
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
                    <AvatarImage src={displayPhoto ?? undefined} alt={user.name} />
                    <AvatarFallback className="text-2xl font-semibold">
                      {getInitials(user.name)}
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

              <div className="space-y-1.5">
                <Label htmlFor="name">Ism familiya</Label>
                <Input
                  id="name"
                  placeholder="Ism familiya"
                  {...form.register("name", {
                    required: "Ism kiritilishi shart",
                  })}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon raqam</Label>
                <Controller
                  name="phone"
                  control={form.control}
                  render={({ field }) => (
                    <PhoneInput
                      id="phone"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
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
