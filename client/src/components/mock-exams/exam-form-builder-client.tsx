"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  TYPES_WITH_OPTIONS,
  defaultMockExamFormFields,
  makeFieldId,
  mockExamFormError,
  mockExamFormSchema,
  type FormFieldType,
  type MockExamFormFieldShape,
  type MockExamFormValues,
} from "@/lib/schemas/mock-exam-form-schema";
import { HelpCircle } from "lucide-react";
import {
  ADD_FIELD_TYPE_ICONS,
  MockExamFieldEditor,
} from "./mock-exam-field-editor";
import { MockExamFormPreview } from "./mock-exam-form-preview";

interface Props {
  examId: string;
}

interface ExamForBuilder {
  id: string;
  title: string;
  status: string;
  formFields: MockExamFormFieldShape[];
}

export function ExamFormBuilderClient({ examId }: Props) {
  const t = useT();
  // The load effect reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const [exam, setExam] = useState<ExamForBuilder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastAddedFieldId, setLastAddedFieldId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<MockExamFormValues>({
    resolver: zodResolver(mockExamFormSchema),
    defaultValues: {
      fields: defaultMockExamFormFields(),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "fields" });
  const watchedFields = useWatch({ control, name: "fields" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ExamForBuilder>(`/mock-exams/${examId}`)
      .then(({ data }) => {
        if (cancelled) return;
        const fields = Array.isArray(data.formFields) ? data.formFields : [];
        setExam(data);
        reset({
          fields:
            fields.length > 0 ? fields : defaultMockExamFormFields(),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const t = tRef.current;
        toast.error(getErrorMessage(error, t("Formani yuklashda xatolik")));
        router.push("/mock-exams");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, reset, router]);

  // Mark mapped fields (firstName / lastName / phone) so they can't be
  // deleted — those are required by the registration flow.
  const mappedIndices = new Set(
    (watchedFields ?? [])
      .map((f, i) => (f?.mapsTo ? i : -1))
      .filter((i) => i >= 0),
  );

  function addField(type: FormFieldType) {
    const id = makeFieldId();
    append({
      id,
      type,
      label: "",
      required: false,
      ...(TYPES_WITH_OPTIONS.includes(type)
        ? { options: [{ value: "opt-1", label: "" }] }
        : {}),
    } satisfies MockExamFormFieldShape);
    setLastAddedFieldId(id);
  }

  useEffect(() => {
    if (!lastAddedFieldId) return;
    const el = document.getElementById(`mef-${lastAddedFieldId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setLastAddedFieldId(null);
  }, [lastAddedFieldId, fields.length]);

  async function onSubmit(values: MockExamFormValues) {
    if (!exam) return;
    setSaving(true);
    try {
      await api.patch(`/mock-exams/${exam.id}`, {
        formFields: values.fields,
      });
      toast.success(t("Forma saqlandi"));
      reset(values); // clears the dirty flag
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!exam) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="pb-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={`/mock-exams/${exam.id}`}>
            <ArrowLeft className="size-4" />
            {t("Orqaga")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border bg-background p-5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold">{t("Forma maydonlari")}</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {t(
                    "Ism, familiya va telefon — ro'yxatga olish uchun majburiy. Ostida qo'shimcha savollar qo'shing.",
                  )}
                </TooltipContent>
              </Tooltip>
            </div>

            {typeof errors.fields?.message === "string" && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {mockExamFormError(t, errors.fields.message)}
              </p>
            )}

            <div className="space-y-3">
              {fields.map((f, i) => {
                const myId = watchedFields?.[i]?.id;
                return (
                  <div
                    key={f.id}
                    id={myId ? `mef-${myId}` : undefined}
                  >
                    <MockExamFieldEditor
                      control={control}
                      index={i}
                      onRemove={() => remove(i)}
                      canRemove={!mappedIndices.has(i)}
                    />
                  </div>
                );
              })}
            </div>

            <AddFieldMenu onPick={addField} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <MockExamFormPreview
            examTitle={exam.title}
            fields={watchedFields ?? []}
          />
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 px-6 py-3 backdrop-blur lg:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {isDirty && !saving ? t("Saqlanmagan o'zgarishlar") : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/mock-exams/${exam.id}`)}
              disabled={saving}
            >
              {t("Orqaga")}
            </Button>
            <Button type="submit" disabled={saving || !isDirty}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("Saqlash")}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function AddFieldMenu({ onPick }: { onPick: (type: FormFieldType) => void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <Plus className="size-4" />
          {t("Maydon qo'shish")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {FIELD_TYPES.map((type) => {
          const Icon = ADD_FIELD_TYPE_ICONS[type];
          const typeLabel = FIELD_TYPE_LABELS[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onPick(type)}>
              <Icon className="mr-2 size-4" />
              {t(typeLabel)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
