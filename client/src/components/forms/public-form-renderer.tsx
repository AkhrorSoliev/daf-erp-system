"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/company";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";
import { FieldError, FieldRow } from "./public-form-fields";
import { firstInvalidId } from "./public-form-scroll";

// After a successful send the lead is taken to the centre's website; the
// pause lets them read the thanks first.
const REDIRECT_AFTER_MS = 3000;

interface Props {
  slug: string;
  schema: {
    title: string;
    description: string | null;
    fields: FormFieldShape[];
  };
  /** Source tag from the share link (?source=...) — attributes the lead. */
  source?: string;
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
export function PublicFormRenderer({ slug, schema, source }: Props) {
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
        body: JSON.stringify({ data: values, source }),
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

  useEffect(() => {
    if (done === null) return;
    const t = setTimeout(
      () => window.location.assign(COMPANY.websiteHref),
      REDIRECT_AFTER_MS,
    );
    return () => clearTimeout(t);
  }, [done]);

  // A phone shows only a slice of a long form: after a failed submit, take
  // the lead to the first field that needs fixing instead of leaving them to
  // hunt for a red line.
  function onInvalid(errs: FieldErrors<Record<string, unknown>>) {
    const id = firstInvalidId(schema.fields, errs);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  if (done) {
    return (
      <FormShell>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center pb-8 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500 sm:min-h-0 sm:py-4">
          <div className="flex size-20 items-center justify-center rounded-full bg-[#2BB673]/10">
            <CheckCircle2 className="size-11 text-[#2BB673]" aria-hidden />
          </div>
          <h1 className="mt-6 text-3xl font-bold">Rahmat!</h1>
          <p
            role="status"
            className="mx-auto mt-2 max-w-xs text-base leading-relaxed text-muted-foreground"
          >
            {done}
          </p>
          <a
            href={COMPANY.websiteHref}
            className="mt-6 text-[15px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            {COMPANY.website} saytiga o&apos;tish
          </a>
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell>
      <BrandHeader title={schema.title} description={schema.description} />

      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        noValidate
        className="space-y-6"
      >
        {schema.fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            control={control}
            register={register}
            error={errors[f.id]?.message as string | undefined}
          />
        ))}

        {/* On a phone the button stays at the bottom edge while the form
            scrolls under it; from sm up it is an ordinary last row. */}
        <div className="sticky bottom-0 z-10 -mx-5 space-y-3 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:p-0 sm:pt-2">
          {submitError && (
            <FieldError id="submit-error" error={submitError} />
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="clay-btn h-14 w-full rounded-[22px] text-base font-bold"
          >
            {submitting && <Loader2 className="size-5 animate-spin" />}
            Yuborish
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

// Phone: the page itself is the form — no card, no grey gutter, so fields get
// the whole width. From sm up it is the Lumio card on the grey canvas.
function FormShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-card sm:grid sm:place-items-center sm:bg-background sm:px-4 sm:py-12">
      <div className="mx-auto w-full bg-card sm:max-w-lg sm:rounded-[26px] sm:border sm:border-border sm:shadow-[0_18px_40px_-12px_rgba(14,42,61,0.18)]">
        <div className="h-1.5 bg-primary sm:rounded-t-[26px]" aria-hidden />
        <div className="px-5 pt-6 sm:p-8">{children}</div>
      </div>
    </main>
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
    <header className="mb-7">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/daf-logo.png"
        alt="DaF Sprachzentrum"
        className="h-8 w-auto object-contain object-left sm:h-10"
      />
      <h1 className="mt-5 text-balance text-[26px] leading-tight font-bold text-foreground sm:text-[28px]">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}
