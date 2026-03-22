"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import type { Lead } from "@/data/lead-model";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import {
  addStudentFromLeadSchema,
  type AddStudentFromLeadValues,
} from "@/lib/schemas/lead-schema";
import { cn } from "@/lib/utils";

interface AddStudentFormProps {
  lead: Lead;
  onClose: () => void;
  formId: string;
}

export function AddStudentForm({ lead, onClose, formId }: AddStudentFormProps) {
  const { moveLead } = useLeadsBoard();

  const form = useForm<AddStudentFromLeadValues>({
    resolver: zodResolver(addStudentFromLeadSchema),
    defaultValues: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      gender: lead.gender,
      group: lead.group,
      telegram: lead.telegramId ?? "",
      parentPhone: "",
      parentName: "",
    },
  });

  const selectedGender = form.watch("gender");

  const onSubmit = () => {
    moveLead(lead.id, "visited");
    toast.success("O'quvchi muvaffaqiyatli qo'shildi");
    onClose();
  };

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Asosiy ma&apos;lumotlar
        </h3>

        {/* First / Last name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-firstName">Ism</Label>
            <Input
              id="lead-firstName"
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
            <Label htmlFor="lead-lastName">Familiya</Label>
            <Input
              id="lead-lastName"
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

        {/* Telegram */}
        <div className="space-y-1.5">
          <Label htmlFor="lead-telegram">Telegram</Label>
          <Input
            id="lead-telegram"
            placeholder="@username"
            {...form.register("telegram")}
          />
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

        {/* Group */}
        <div className="space-y-1.5">
          <Label htmlFor="lead-group">Guruh</Label>
          <Input
            id="lead-group"
            placeholder="Guruh darajasi"
            {...form.register("group")}
          />
          {form.formState.errors.group && (
            <p className="text-xs text-destructive">
              {form.formState.errors.group.message}
            </p>
          )}
        </div>
      </section>

      {/* Parent info */}
      <section className="space-y-5 border-t px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Ota-ona ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="lead-parentName">Ota-ona ismi</Label>
          <Input
            id="lead-parentName"
            placeholder="Ota-ona ismi"
            {...form.register("parentName")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Ota-ona telefon raqami</Label>
          <Controller
            control={form.control}
            name="parentPhone"
            render={({ field }) => (
              <PhoneInput
                value={field.value ?? ""}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
          {form.formState.errors.parentPhone && (
            <p className="text-xs text-destructive">
              {form.formState.errors.parentPhone.message}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
