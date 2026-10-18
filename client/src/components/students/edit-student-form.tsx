"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Eye, EyeOff, User, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EditStudentAdditionalFields } from "./edit-student-additional-fields";
import {
  editStudentSchema,
  studentFormError,
  type EditStudentFormValues,
} from "@/lib/schemas/student-schema";
import { useT } from "@/i18n/context";
import type { Student } from "@/data/student-model";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";

function stripPhonePrefix(phone: string): string {
  return phone.replace(/^\+998/, "").replace(/\s/g, "");
}

function mapStudentToForm(student: Student): EditStudentFormValues {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    phone: stripPhonePrefix(student.phone),
    telegram: student.telegram ?? "",
    gender:
      student.gender === "MALE"
        ? "male"
        : student.gender === "FEMALE"
          ? "female"
          : "",
    photo: student.photo ?? "",
    dateOfBirth: student.date_of_birth ?? "",
    comment: student.comment ?? "",
    extraPhone: student.extraPhone ? stripPhonePrefix(student.extraPhone) : "",
    parentPhone: student.parentPhone
      ? stripPhonePrefix(student.parentPhone)
      : "",
    parentName: student.parentName ?? "",
    placeOfStudy: student.placeOfStudy ?? "",
    address: student.address ?? "",
    passportSeries: student.passportSeries ?? "",
    password: "",
    discountPercent: student.discountPercent ?? 0,
  };
}

interface EditStudentFormProps {
  student: Student;
  onClose: () => void;
  onSaved?: (student: Student) => void;
  formId: string;
}

export function EditStudentForm({
  student,
  onClose,
  onSaved,
  formId,
}: EditStudentFormProps) {
  const t = useT();
  const form = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentSchema),
    defaultValues: mapStudentToForm(student),
  });

  const user = useAuth((s) => s.user);
  const canSetDiscount =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState(student.photo);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
      setAvatarFile(file);
    }
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

  const onSubmit = async (values: EditStudentFormValues) => {
    try {
      let photoUrl: string | undefined;
      if (avatarFile) {
        photoUrl = await uploadAvatar();
      }

      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        telegram: values.telegram || null,
        gender:
          values.gender === "male"
            ? "MALE"
            : values.gender === "female"
              ? "FEMALE"
              : null,
        dateOfBirth: values.dateOfBirth || null,
        comment: values.comment || null,
        extraPhone: values.extraPhone || null,
        parentPhone: values.parentPhone || null,
        parentName: values.parentName || null,
        placeOfStudy: values.placeOfStudy || null,
        address: values.address || null,
        passportSeries: values.passportSeries || null,
        photo: photoUrl ?? (student.photo || undefined),
      };

      if (canSetDiscount && values.discountPercent !== undefined) {
        payload.discountPercent = values.discountPercent;
      }

      if (values.password) {
        payload.password = values.password;
      }

      const { data } = await api.patch(`/students/${student.id}`, payload);
      toast.success(t("O'quvchi muvaffaqiyatli yangilandi"));
      onSaved?.(data);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik yuz berdi")));
    }
  };

  const initials = student.firstName.charAt(0) + student.lastName.charAt(0);
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
          {t("Asosiy ma'lumotlar")}
        </h3>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16">
              <AvatarImage
                src={avatarPreview ?? undefined}
                alt={student.firstName}
              />
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
              <TooltipContent>{t("Rasm yuklash")}</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="font-medium">
              {student.firstName} {student.lastName}
            </p>
            <p className="text-xs text-muted-foreground">ID: {student.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t("Ism")}</Label>
            <Input
              id="firstName"
              placeholder={t("Ism")}
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-xs text-destructive">
                {studentFormError(t, form.formState.errors.firstName.message)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t("Familiya")}</Label>
            <Input
              id="lastName"
              placeholder={t("Familiya")}
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-xs text-destructive">
                {studentFormError(t, form.formState.errors.lastName.message)}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("Telefon raqam")}</Label>
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
              {studentFormError(t, form.formState.errors.phone.message)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telegram">Telegram</Label>
          <Input
            id="telegram"
            placeholder="@username"
            {...form.register("telegram")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("Tug'ilgan sana")}</Label>
          <Controller
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <DatePicker
                value={field.value ? new Date(field.value) : undefined}
                onChange={(date) => field.onChange(date?.toISOString() ?? "")}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("Jinsi")}</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => form.setValue("gender", "male")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                selectedGender === "male"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              <User className="size-4" />
              {t("Erkak")}
            </button>
            <button
              type="button"
              onClick={() => form.setValue("gender", "female")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                selectedGender === "female"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              <UserRound className="size-4" />
              {t("Ayol")}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="comment">{t("Izoh")}</Label>
          <Input
            id="comment"
            placeholder={t("O'quvchi haqida izoh...")}
            {...form.register("comment")}
          />
        </div>

        {canSetDiscount && (
          <div className="space-y-1.5">
            <Label htmlFor="discountPercent">{t("Chegirma (%)")}</Label>
            <div className="relative">
              <Input
                id="discountPercent"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="0"
                className="pr-8"
                {...form.register("discountPercent", { valueAsNumber: true })}
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Chegirma har bir darsda balansdan ushlanadigan summaga qo'llanadi. O'zgarish faqat keyingi darslarga ta'sir qiladi — o'tgan darslar qayta hisoblanmaydi.",
              )}
            </p>
            {form.formState.errors.discountPercent && (
              <p className="text-xs text-destructive">
                {studentFormError(
                  t,
                  form.formState.errors.discountPercent.message,
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Kirish ma'lumotlari */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("Kirish ma'lumotlari")}
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t("Yangi parol")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("O'zgartirmaslik uchun bo'sh qoldiring")}
              className="pr-9"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showPassword
                  ? t("Parolni yashirish")
                  : t("Parolni ko'rsatish")}
              </TooltipContent>
            </Tooltip>
          </div>
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">
              {studentFormError(t, form.formState.errors.password.message)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              "O'quvchi student.dafzentrum.uz tizimiga telefon raqami va parol bilan kiradi.",
            )}
          </p>
        </div>
      </section>

      {/* Qo'shimcha ma'lumotlar */}
      <section className="space-y-5 border-t px-6 py-5">
        <EditStudentAdditionalFields form={form} />
      </section>
    </form>
  );
}
