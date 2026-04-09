"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Trash2, User, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  editTeacherSchema,
  type EditTeacherFormValues,
} from "@/lib/schemas/teacher-schema";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher"; // getState() orqali ishlatiladi
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface EditTeacherFormProps {
  teacher: TeacherData | null;
  isAdd?: boolean;
  onClose: () => void;
  onSaved?: (updated: TeacherData) => void;
  formId: string;
}

function teacherToForm(teacher: TeacherData | null): EditTeacherFormValues {
  if (!teacher) {
    return { firstName: "", lastName: "", phone: "", gender: "", avatar: "", login: "", password: "" };
  }
  const firstName = teacher.firstName;
  const lastName = teacher.lastName;
  return {
    firstName,
    lastName,
    phone: teacher.phone ?? "",
    gender: teacher.gender === "MALE" ? "male" : teacher.gender === "FEMALE" ? "female" : "",
    avatar: teacher.photo ?? "",
    login: teacher.login ?? "",
    password: "",
  };
}

export function EditTeacherForm({
  teacher,
  isAdd = false,
  onClose,
  onSaved,
  formId,
}: EditTeacherFormProps) {
  const form = useForm<EditTeacherFormValues>({
    resolver: zodResolver(editTeacherSchema),
    defaultValues: teacherToForm(teacher),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState(teacher?.photo ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const setSubmitting = useEditTeacher((s) => s.setSubmitting);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
      setAvatarFile(file);
      form.setValue("avatar", url);
      setPhotoRemoved(false);
    }
  };

  const [photoRemoved, setPhotoRemoved] = useState(false);

  const handleRemovePhoto = () => {
    setAvatarPreview("");
    setAvatarFile(null);
    setPhotoRemoved(true);
    form.setValue("avatar", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadAvatar = async (): Promise<string | undefined> => {
    if (!avatarFile) return undefined;
    const formData = new FormData();
    formData.append("file", avatarFile);
    const { data } = await api.post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.url;
  };

  const onSubmit = async (values: EditTeacherFormValues) => {
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (avatarFile) {
        photoUrl = await uploadAvatar();
      }

      const genderMap: Record<string, string> = { male: "MALE", female: "FEMALE" };
      const branchId = useBranchSwitcher.getState().selectedBranch?.id;
      const payload: Record<string, unknown> = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        gender: values.gender ? genderMap[values.gender] : undefined,
        photo: photoRemoved ? null : (photoUrl ?? (teacher?.photo || undefined)),
      };
      if (isAdd && branchId) {
        payload.branchId = branchId;
      }
      if (!isAdd) {
        if (values.login) payload.login = values.login;
        if (values.password) payload.password = values.password;
      }

      if (isAdd) {
        const { data } = await api.post("/teachers", payload);
        if (data.generatedLogin && data.generatedPassword) {
          toast.success(
            `O'qituvchi qo'shildi!\nLogin: ${data.generatedLogin}\nParol: ${data.generatedPassword}`,
            { duration: 8000 },
          );
        } else {
          toast.success("O'qituvchi muvaffaqiyatli qo'shildi");
        }
        onSaved?.(data);
      } else if (teacher) {
        const { data } = await api.patch(`/teachers/${teacher.id}`, payload);
        toast.success("O'qituvchi muvaffaqiyatli yangilandi");
        onSaved?.(data);
      }
      onClose();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const initials = isAdd
    ? "?"
    : `${teacher?.firstName?.[0] ?? ''}${teacher?.lastName?.[0] ?? ''}`;
  const selectedGender = form.watch("gender");

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      {/* Asosiy ma'lumotlar */}
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Asosiy ma&apos;lumotlar
        </h3>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16">
              <AvatarImage src={avatarPreview} alt="Avatar" />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="absolute -bottom-1 -right-1 rounded-full border-background bg-background shadow-sm"
                  tabIndex={-1}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rasm yuklash</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="flex flex-col gap-1">
            {!isAdd && teacher && (
              <div>
                <p className="font-medium">{teacher.firstName} {teacher.lastName}</p>
                <p className="text-xs text-muted-foreground">ID: {teacher.id}</p>
              </div>
            )}
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="size-3" />
                Rasmni o&apos;chirish
              </button>
            )}
          </div>
        </div>

        {/* Ism / Familiya */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Ism</Label>
            <Input
              id="firstName"
              placeholder="Ism"
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.firstName.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Familiya</Label>
            <Input
              id="lastName"
              placeholder="Familiya"
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.lastName.message}
              </p>
            )}
          </div>
        </div>

        {/* Telefon */}
        <div className="space-y-1.5">
          <Label>Telefon raqam</Label>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                value={field.value}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
          {form.formState.errors.phone && (
            <p className="text-xs text-destructive">
              {form.formState.errors.phone.message}
            </p>
          )}
        </div>

        {/* Jins */}
        <div className="space-y-1.5">
          <Label>Jinsi</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => form.setValue("gender", "male")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                selectedGender === "male"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              <User className="size-4" />
              Erkak
            </button>
            <button
              type="button"
              onClick={() => form.setValue("gender", "female")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                selectedGender === "female"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              <UserRound className="size-4" />
              Ayol
            </button>
          </div>
        </div>
      </section>

      {/* Login, Parol, Holat — faqat tahrirlashda */}
      {!isAdd && (
        <section className="space-y-5 border-t px-6 py-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tizim ma&apos;lumotlari
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="login">Login</Label>
            <Input
              id="login"
              placeholder="Login"
              {...form.register("login")}
            />
            {form.formState.errors.login && (
              <p className="text-xs text-destructive">
                {form.formState.errors.login.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Yangi parol</Label>
            <Input
              id="password"
              type="password"
              placeholder="Bo'sh qoldirilsa o'zgarmaydi"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

        </section>
      )}
    </form>
  );
}
