"use client";

import { useState } from "react";
import { Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import type { MockExamFormFieldShape } from "@/lib/schemas/mock-exam-form-schema";

interface Props {
  examTitle: string;
  fields: MockExamFormFieldShape[];
}

// Live preview of the form as Telegram users will see it on the bot's web
// form. The bot scene (Faza 4) walks through the same questions one by one.
export function MockExamFormPreview({ examTitle, fields }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Eye className="size-3.5" />
        <span>
          Ishtirokchi bot orqali shu savollarga javob beradi
        </span>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 sm:p-5">
        <div className="rounded-md border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="break-words text-lg font-semibold">
            {examTitle || "Imtihon nomi"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ro&apos;yxatga olish
          </p>

          <div className="mt-5 space-y-4">
            {fields.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                Maydon qo&apos;shilmagan
              </p>
            ) : (
              fields.map((field) => (
                <PreviewField key={field.id} field={field} />
              ))
            )}
          </div>

          <Button type="button" disabled className="mt-5 w-full opacity-90">
            <Send className="size-4" />
            Yuborish (demo)
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: MockExamFormFieldShape }) {
  const [localValue, setLocalValue] = useState<unknown>(
    field.type === "checkbox" ? false : "",
  );

  const labelEl = (
    <Label className="text-sm font-medium">
      {field.label || "Maydon nomi"}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "textarea") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Textarea
          rows={3}
          placeholder={field.placeholder}
          value={(localValue as string) ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "phone") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <PhoneInput
          value={(localValue as string) ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Select
          value={(localValue as string) || undefined}
          onValueChange={(v) => setLocalValue(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.placeholder ?? "Tanlang"} />
          </SelectTrigger>
          <SelectContent>
            {field.options && field.options.length > 0 ? (
              field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label || o.value}
                </SelectItem>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Variantlar qo&apos;shilmagan
              </div>
            )}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        {field.options && field.options.length > 0 ? (
          <div className="space-y-1.5">
            {field.options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name={field.id}
                  value={o.value}
                  checked={localValue === o.value}
                  onChange={() => setLocalValue(o.value)}
                  className="size-4 cursor-pointer accent-primary"
                />
                {o.label || o.value}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Variantlar qo&apos;shilmagan
          </p>
        )}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={Boolean(localValue)}
          onCheckedChange={(v) => setLocalValue(Boolean(v))}
          className="mt-0.5"
        />
        <span>
          {field.label || "Maydon nomi"}
          {field.required && (
            <span className="ml-0.5 text-destructive">*</span>
          )}
        </span>
      </label>
    );
  }

  if (field.type === "date") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <DatePicker
          value={
            typeof localValue === "string" && localValue
              ? new Date(localValue)
              : undefined
          }
          onChange={(d) =>
            setLocalValue(d ? d.toISOString().slice(0, 10) : "")
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {labelEl}
      <Input
        type={
          field.type === "email"
            ? "email"
            : field.type === "number"
              ? "number"
              : "text"
        }
        placeholder={field.placeholder}
        value={(localValue as string) ?? ""}
        onChange={(e) => setLocalValue(e.target.value)}
      />
    </div>
  );
}
