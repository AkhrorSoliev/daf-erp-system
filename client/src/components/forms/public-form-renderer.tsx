"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
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
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

interface Props {
  slug: string;
  schema: {
    title: string;
    description: string | null;
    fields: FormFieldShape[];
  };
}

// Build a per-form zod schema from the field definitions.
function buildZodSchema(fields: FormFieldShape[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let base: z.ZodTypeAny;
    if (f.type === "phone") {
      // 9 raw digits
      base = z.string().regex(/^\d{9}$/, "Telefon — 9 raqam");
    } else if (f.type === "email") {
      base = z.string().email("To'g'ri email kiriting");
    } else if (f.type === "number") {
      base = z.coerce.number({ message: "Son kiriting" });
    } else if (f.type === "checkbox") {
      base = z.boolean().default(false);
    } else if (f.type === "date") {
      base = z.string().min(1);
    } else if (f.type === "select" || f.type === "radio") {
      const allowed = f.options?.map((o) => o.value) ?? [];
      base = allowed.length
        ? z.enum(allowed as [string, ...string[]])
        : z.string();
    } else {
      base = z.string();
    }

    if (!f.required) {
      if (f.type === "checkbox") {
        // checkboxes default false; "not required" is already permissive
        shape[f.id] = base;
      } else {
        shape[f.id] = z.preprocess(
          (v) => (v === "" || v === undefined ? undefined : v),
          base.optional(),
        );
      }
    } else {
      if (f.type === "checkbox") {
        // a required checkbox must be true
        shape[f.id] = z.literal(true, { message: "Bu maydon belgilanishi kerak" });
      } else {
        shape[f.id] = z.preprocess(
          (v) => (v === "" ? undefined : v),
          // `.optional()` lets an empty/undefined value skip the base type
          // check (which would otherwise emit "expected string, received
          // undefined") so the friendly Uzbek message is shown instead.
          base.optional().refine((v) => v !== undefined && v !== null, {
            message: "To'ldirilishi shart",
          }),
        );
      }
    }
  }
  return z.object(shape);
}

export function PublicFormRenderer({ slug, schema }: Props) {
  const zodSchema = useMemo(() => buildZodSchema(schema.fields), [schema.fields]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultValues = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const f of schema.fields) {
      if (f.type === "checkbox") out[f.id] = false;
      else out[f.id] = "";
    }
    return out;
  }, [schema.fields]);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(zodSchema as any),
    defaultValues,
  });

  async function onSubmit(values: Record<string, unknown>) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
      const res = await fetch(`${apiUrl}/public/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message;
        setSubmitError(msg || "Yuborishda xatolik. Qayta urinib ko'ring.");
        return;
      }
      setDone(body?.message || "Ma'lumotlaringiz qabul qilindi.");
    } catch {
      setSubmitError("Server bilan aloqa o'rnatib bo'lmadi");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <FormCard>
        <div className="py-2 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#2BB673]/10">
            <CheckCircle2 className="size-9 text-[#2BB673]" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Rahmat!</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
            {done}
          </p>
        </div>
      </FormCard>
    );
  }

  return (
    <FormCard>
      <BrandHeader title={schema.title} description={schema.description} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {schema.fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            control={control}
            register={register}
            error={errors[f.id]?.message as string | undefined}
          />
        ))}

        {submitError && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="clay-btn h-14 w-full rounded-[22px] text-base font-bold"
        >
          {submitting && <Loader2 className="size-5 animate-spin" />}
          Yuborish
        </Button>
      </form>
    </FormCard>
  );
}

// Lumio surface card — soft 26px radius, hairline border, ink-tinted shadow.
function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-border bg-card p-6 shadow-[0_18px_40px_-12px_rgba(14,42,61,0.18)] sm:p-8">
      {children}
    </div>
  );
}

function BrandHeader({
  title,
  description,
}: {
  title: string;
  description: string | null;
}) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/daf-logo.png"
        alt="DaF Sprachzentrum"
        className="h-10 w-auto object-contain"
      />
      <h1 className="mt-5 text-[26px] leading-tight font-bold text-foreground">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-sm whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

function FieldRow({
  field,
  control,
  register,
  error,
}: {
  field: FormFieldShape;
  control: ReturnType<typeof useForm<Record<string, unknown>>>["control"];
  register: ReturnType<typeof useForm<Record<string, unknown>>>["register"];
  error?: string;
}) {
  const labelEl = (
    <Label
      htmlFor={field.id}
      className="text-[15px] font-semibold text-foreground"
    >
      {field.label}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "textarea") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Textarea
          id={field.id}
          {...register(field.id)}
          placeholder={field.placeholder}
          rows={3}
          className="min-h-28 rounded-2xl px-4 py-3 text-base"
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "phone") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <PhoneInput
              value={(f.value as string) ?? ""}
              onChange={(e) => f.onChange(e.target.value)}
              className="h-12 px-4 text-base"
            />
          )}
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <Select
              value={(f.value as string) ?? ""}
              onValueChange={f.onChange}
            >
              <SelectTrigger className="w-full px-4 text-base">
                <SelectValue placeholder={field.placeholder ?? "Tanlang"} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <div className="space-y-2">
              {field.options?.map((o) => {
                const selected = f.value === o.value;
                return (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 font-semibold text-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name={field.id}
                      value={o.value}
                      checked={selected}
                      onChange={() => f.onChange(o.value)}
                      className="size-5 cursor-pointer accent-primary"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="space-y-2">
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] leading-snug transition-colors hover:bg-accent">
              <Checkbox
                checked={Boolean(f.value)}
                onCheckedChange={(v) => f.onChange(Boolean(v))}
                className="mt-0.5 size-5"
              />
              <span>
                {field.label}
                {field.required && (
                  <span className="ml-0.5 text-destructive">*</span>
                )}
              </span>
            </label>
          )}
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <DatePicker
              value={f.value ? new Date(f.value as string) : undefined}
              onChange={(d) =>
                f.onChange(d ? d.toISOString().slice(0, 10) : "")
              }
              className="h-12 rounded-2xl px-4 text-base font-normal"
            />
          )}
        />
        {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  // text / email / number
  return (
    <div className="space-y-2">
      {labelEl}
      <Input
        id={field.id}
        type={
          field.type === "email"
            ? "email"
            : field.type === "number"
              ? "number"
              : "text"
        }
        {...register(field.id)}
        placeholder={field.placeholder}
        className="h-12 px-4 text-base"
      />
      {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
    </div>
  );
}
