"use client";

import { Controller, type useForm } from "react-hook-form";
import { CircleAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

type FormApi = ReturnType<typeof useForm<Record<string, unknown>>>;

// One size for every control, so a phone shows one even column of fields:
// 52px tall (a thumb-sized target), 16px text (iOS does not zoom on focus).
const CONTROL = "h-13 rounded-2xl px-4 text-base";

// A choice card (radio option, consent box): same height as a control.
const CHOICE =
  "group flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-base leading-snug transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none";

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-[13px] leading-snug font-medium text-destructive"
    >
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

function FieldLabel({
  field,
  htmlFor,
}: {
  field: FormFieldShape;
  htmlFor?: string;
}) {
  return (
    <Label
      id={`${field.id}-label`}
      htmlFor={htmlFor}
      className="text-[15px] leading-snug font-semibold text-foreground"
    >
      {field.label}
      {field.required && (
        <span aria-hidden className="text-primary">
          *
        </span>
      )}
    </Label>
  );
}

export function FieldRow({
  field,
  control,
  register,
  error,
}: {
  field: FormFieldShape;
  control: FormApi["control"];
  register: FormApi["register"];
  error?: string;
}) {
  const errId = `${field.id}-error`;
  const invalid = Boolean(error);
  const described = invalid ? errId : undefined;
  const wrap = "scroll-mt-6 space-y-2";

  if (field.type === "checkbox") {
    return (
      <div className={wrap}>
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <label
              className={cn(
                CHOICE,
                "items-start has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5",
                invalid ? "border-destructive" : "border-input",
              )}
            >
              <Checkbox
                id={field.id}
                checked={Boolean(f.value)}
                onCheckedChange={(v) => f.onChange(Boolean(v))}
                aria-invalid={invalid}
                aria-describedby={described}
                className="mt-0.5 size-6 rounded-lg"
              />
              <span>
                {field.label}
                {field.required && (
                  <span aria-hidden className="text-primary">
                    *
                  </span>
                )}
              </span>
            </label>
          )}
        />
        <FieldError id={errId} error={error} />
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className={wrap}>
        <FieldLabel field={field} />
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <div
              id={field.id}
              role="radiogroup"
              tabIndex={-1}
              aria-labelledby={`${field.id}-label`}
              aria-describedby={described}
              className="space-y-2 outline-none"
            >
              {field.options?.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    CHOICE,
                    "has-checked:border-primary has-checked:bg-primary/5 has-checked:font-semibold",
                    invalid ? "border-destructive" : "border-input",
                  )}
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={o.value}
                    checked={f.value === o.value}
                    onChange={() => f.onChange(o.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-input bg-card transition-colors group-has-checked:border-primary motion-reduce:transition-none"
                  >
                    <span className="size-3 scale-0 rounded-full bg-primary transition-transform group-has-checked:scale-100 motion-reduce:transition-none" />
                  </span>
                  {o.label}
                </label>
              ))}
            </div>
          )}
        />
        <FieldError id={errId} error={error} />
      </div>
    );
  }

  let control_: React.ReactNode;
  if (field.type === "textarea") {
    control_ = (
      <Textarea
        id={field.id}
        {...register(field.id)}
        placeholder={field.placeholder}
        rows={3}
        aria-invalid={invalid}
        aria-describedby={described}
        className="min-h-28 rounded-2xl px-4 py-3.5 text-base"
      />
    );
  } else if (field.type === "phone") {
    control_ = (
      <Controller
        control={control}
        name={field.id}
        render={({ field: f }) => (
          <PhoneInput
            id={field.id}
            value={(f.value as string) ?? ""}
            onChange={(e) => f.onChange(e.target.value)}
            autoComplete="tel-national"
            enterKeyHint="next"
            aria-invalid={invalid}
            aria-describedby={described}
            prefixClassName="rounded-l-2xl border-input px-4 text-base"
            className={cn(CONTROL, "rounded-l-none")}
          />
        )}
      />
    );
  } else if (field.type === "select") {
    control_ = (
      <Controller
        control={control}
        name={field.id}
        render={({ field: f }) => (
          <Select
            value={(f.value as string) ?? ""}
            onValueChange={f.onChange}
          >
            <SelectTrigger
              id={field.id}
              aria-invalid={invalid}
              aria-describedby={described}
              className="w-full rounded-2xl bg-card px-4 text-base"
            >
              <SelectValue placeholder={field.placeholder ?? "Tanlang"} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((o) => (
                <SelectItem key={o.value} value={o.value} className="py-3 text-base">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    );
  } else if (field.type === "date") {
    control_ = (
      <Controller
        control={control}
        name={field.id}
        render={({ field: f }) => (
          <DatePicker
            id={field.id}
            value={f.value ? new Date(f.value as string) : undefined}
            onChange={(d) =>
              f.onChange(d ? d.toISOString().slice(0, 10) : "")
            }
            className={cn(
              CONTROL,
              "bg-card font-normal hover:bg-accent",
              invalid && "border-destructive",
            )}
          />
        )}
      />
    );
  } else {
    // text / email / number
    control_ = (
      <Input
        id={field.id}
        type={
          field.type === "email"
            ? "email"
            : field.type === "number"
              ? "number"
              : "text"
        }
        autoComplete={field.type === "email" ? "email" : undefined}
        enterKeyHint="next"
        {...register(field.id)}
        placeholder={field.placeholder}
        aria-invalid={invalid}
        aria-describedby={described}
        className={CONTROL}
      />
    );
  }

  return (
    <div className={wrap}>
      <FieldLabel field={field} htmlFor={field.id} />
      {control_}
      <FieldError id={errId} error={error} />
    </div>
  );
}
