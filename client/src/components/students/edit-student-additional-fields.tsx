"use client";

import { useRef, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import {
  GraduationCap,
  MapPin,
  CreditCard,
  Users,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EditStudentFormValues } from "@/lib/schemas/student-schema";

interface EditStudentAdditionalFieldsProps {
  form: UseFormReturn<EditStudentFormValues>;
}

const sections = [
  {
    key: "placeOfStudy",
    icon: GraduationCap,
    tooltip: "O'quv joyi",
    fields: ["placeOfStudy"] as const,
  },
  {
    key: "parent",
    icon: Users,
    tooltip: "Ota-ona ma'lumotlari",
    fields: ["parentPhone", "parentName"] as const,
  },
  {
    key: "address",
    icon: MapPin,
    tooltip: "Manzil",
    fields: ["address"] as const,
  },
  {
    key: "passportSeries",
    icon: CreditCard,
    tooltip: "Pasport seriyasi",
    fields: ["passportSeries"] as const,
  },
] as const;

export function EditStudentAdditionalFields({
  form,
}: EditStudentAdditionalFieldsProps) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const iconsRef = useRef<HTMLDivElement>(null);

  const toggle = (key: string) => {
    let isAdding = false;
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        const section = sections.find((s) => s.key === key);
        if (section) {
          for (const field of section.fields) {
            form.setValue(field, "");
          }
        }
      } else {
        next.add(key);
        isAdding = true;
      }
      return next;
    });

    if (isAdding) {
      requestAnimationFrame(() => {
        iconsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  };

  const hasAnyVisible = visible.size > 0;

  return (
    <div className="space-y-4">
      {/* Section heading */}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Plus className="size-3.5" />
        Qo&apos;shimcha ma&apos;lumotlar
      </h3>

      {/* Dynamic fields — above icons */}
      {hasAnyVisible && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          {visible.has("placeOfStudy") && (
            <div className="space-y-1.5">
              <Label>O&apos;quv joyi</Label>
              <Input
                placeholder="Maktab, universitet..."
                {...form.register("placeOfStudy")}
              />
            </div>
          )}

          {visible.has("parent") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ota-ona ismi</Label>
                <Input
                  placeholder="Ota-ona to'liq ismi"
                  {...form.register("parentName")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ota-ona telefoni</Label>
                <Controller
                  control={form.control}
                  name="parentPhone"
                  render={({ field }) => (
                    <PhoneInput
                      value={field.value}
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
            </div>
          )}

          {visible.has("address") && (
            <div className="space-y-1.5">
              <Label>Manzil</Label>
              <Input
                placeholder="Yashash manzili"
                {...form.register("address")}
              />
            </div>
          )}

          {visible.has("passportSeries") && (
            <div className="space-y-1.5">
              <Label>Pasport seriyasi</Label>
              <Input
                placeholder="AB1234567"
                {...form.register("passportSeries")}
              />
            </div>
          )}
        </div>
      )}

      {/* Icon selector row — at the bottom */}
      <div ref={iconsRef} className="flex items-center gap-2">
        {sections.map((section) => {
          const isActive = visible.has(section.key);
          return (
            <Tooltip key={section.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggle(section.key)}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-lg border transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <section.icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{section.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
