"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Eye, EyeOff, User, UserRound } from "lucide-react";
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
import type { Teacher } from "@/data/teacher-model";
import { cn } from "@/lib/utils";

function stripPhonePrefix(phone: string): string {
  return phone.replace(/^\+998/, "").replace(/\s/g, "");
}

function mapTeacherToForm(teacher: Teacher): EditTeacherFormValues {
  return {
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    phone: stripPhonePrefix(teacher.phone),
    gender: teacher.gender,
    avatar: teacher.avatar ?? "",
    login: "",
    password: "",
  };
}

interface EditTeacherFormProps {
  teacher: Teacher;
  onClose: () => void;
  formId: string;
}

export function EditTeacherForm({
  teacher,
  onClose,
  formId,
}: EditTeacherFormProps) {
  const form = useForm<EditTeacherFormValues>({
    resolver: zodResolver(editTeacherSchema),
    defaultValues: mapTeacherToForm(teacher),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState(teacher.avatar);
  const [showPassword, setShowPassword] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
      form.setValue("avatar", url);
    }
  };

  const onSubmit = () => {
    onClose();
  };

  const initials = teacher.firstName.charAt(0) + teacher.lastName.charAt(0);
  const selectedGender = form.watch("gender");

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      {/* ── Asosiy ma'lumotlar ── */}
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Asosiy ma&apos;lumotlar
        </h3>

        {/* Avatar + name display */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16">
              <AvatarImage src={avatarPreview} alt={teacher.firstName} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="absolute -bottom-1 -right-1 rounded-full border-background bg-background shadow-sm"
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
          <div>
            <p className="font-medium">
              {teacher.firstName} {teacher.lastName}
            </p>
            <p className="text-xs text-muted-foreground">ID: {teacher.id}</p>
          </div>
        </div>

        {/* First / Last name */}
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

        {/* Phone */}
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

        {/* Gender */}
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

      {/* ── Kirish ma'lumotlari ── */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Kirish ma&apos;lumotlari
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="login">Login</Label>
            <Input
              id="login"
              placeholder="Login"
              {...form.register("login")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Parol</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Parol"
                className="pr-9"
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
                  {showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}
