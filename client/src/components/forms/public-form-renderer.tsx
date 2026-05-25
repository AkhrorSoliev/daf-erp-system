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
          base.refine((v) => v !== undefined && v !== null, {
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
      <div className="rounded-lg border bg-background p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <h1 className="mt-3 text-lg font-semibold">Rahmat!</h1>
        <p className="mt-2 text-sm text-muted-foreground">{done}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold">{schema.title}</h1>
      {schema.description && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {schema.description}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
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
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Yuborish
        </Button>
      </form>
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
    <Label htmlFor={field.id} className="text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "textarea") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Textarea
          id={field.id}
          {...register(field.id)}
          placeholder={field.placeholder}
          rows={3}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "phone") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <PhoneInput
              value={(f.value as string) ?? ""}
              onChange={(e) => f.onChange(e.target.value)}
            />
          )}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <Select
              value={(f.value as string) ?? ""}
              onValueChange={f.onChange}
            >
              <SelectTrigger>
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
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <div className="space-y-1.5">
              {field.options?.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={o.value}
                    checked={f.value === o.value}
                    onChange={() => f.onChange(o.value)}
                    className="size-4 cursor-pointer accent-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="space-y-1.5">
        <Controller
          control={control}
          name={field.id}
          render={({ field: f }) => (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={Boolean(f.value)}
                onCheckedChange={(v) => f.onChange(Boolean(v))}
                className="mt-0.5"
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
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="space-y-1.5">
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
            />
          )}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  // text / email / number
  return (
    <div className="space-y-1.5">
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
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
