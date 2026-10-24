"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, HelpCircle, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import {
  leadColumnName,
  useLeadsBoard,
  useLeadsBoardTranslator,
} from "@/hooks/use-leads-board";
import {
  customFormError,
  customFormSchema,
  defaultFormFields,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  makeFieldId,
  TYPES_WITH_OPTIONS,
  type CustomFormFormValues,
  type FormFieldShape,
  type FormFieldType,
} from "@/lib/schemas/custom-form-schema";
import type {
  CustomFormDetail,
  CustomFormSummary,
} from "@/hooks/use-custom-forms";
import {
  ADD_FIELD_TYPE_ICONS,
  FormFieldEditor,
} from "./form-field-editor";
import { FormPreview } from "./form-preview";
import { CopyFormLinkButton } from "./copy-form-link-dialog";

interface Props {
  formId?: string;
}

export function FormBuilderClient({ formId }: Props) {
  const t = useT();
  useLeadsBoardTranslator();
  // The load effect reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const setName = useBreadcrumbName((s) => s.setName);
  // Tahrirlashda javoblar sahifasiga, yaratishda ro'yxatga qaytiladi.
  const backHref = formId ? `/leads/forms/${formId}` : "/leads/forms";
  const board = useLeadsBoard((s) => s.board);
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);

  const [loading, setLoading] = useState(!!formId);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  // Column tracked locally so users can pick a column with 0 sections without
  // the cascading select snapping back to empty.
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  // ID of the most-recently-added field — used to scroll it into view so the
  // admin sees what just appeared (the list can be long).
  const [lastAddedFieldId, setLastAddedFieldId] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CustomFormFormValues>({
    resolver: zodResolver(customFormSchema),
    defaultValues: {
      title: "",
      description: "",
      sectionId: "",
      fields: defaultFormFields(),
      isActive: true,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "fields" });
  const watchedFields = useWatch({ control, name: "fields" });
  const watchedSectionId = useWatch({ control, name: "sectionId" });
  // Read title + description reactively so the live preview re-renders as
  // the admin types. `defaultValue` keeps the very first render from
  // flashing the placeholder.
  const watchedTitle = useWatch({ control, name: "title", defaultValue: "" });
  const watchedDescription = useWatch({
    control,
    name: "description",
    defaultValue: "",
  });

  // Initial column sync — when loading an existing form, derive columnId
  // from the persisted sectionId once the board is in memory.
  useEffect(() => {
    if (!watchedSectionId || !board.length || selectedColumnId) return;
    for (const col of board) {
      if (col.sections.some((s) => s.id === watchedSectionId)) {
        setSelectedColumnId(col.id);
        return;
      }
    }
  }, [board, watchedSectionId, selectedColumnId]);

  useEffect(() => {
    if (!board.length) fetchBoard();
  }, [board.length, fetchBoard]);

  useEffect(() => {
    if (!formId) return;
    setLoading(true);
    api
      .get<CustomFormDetail>(`/custom-forms/${formId}`)
      .then(({ data }) => {
        setSlug(data.slug);
        setName(formId, data.title);
        reset({
          title: data.title,
          description: data.description ?? "",
          sectionId: data.sectionId,
          fields: data.fields,
          isActive: data.isActive,
        });
      })
      .catch((error) => {
        const t = tRef.current;
        toast.error(getErrorMessage(error, t("Formani yuklashda xatolik")));
        router.push("/leads/forms");
      })
      .finally(() => setLoading(false));
  }, [formId, reset, router, setName]);

  const availableSections = useMemo(() => {
    if (!selectedColumnId) return [];
    return board.find((c) => c.id === selectedColumnId)?.sections ?? [];
  }, [board, selectedColumnId]);

  // Track which field indices are "system" (mapped to firstName/lastName/phone)
  // — those can't be removed, can't change type, and stay required.
  const mappedIndices = useMemo(
    () =>
      new Set(
        (watchedFields ?? [])
          .map((f, i) => (f?.mapsTo ? i : -1))
          .filter((i) => i >= 0),
      ),
    [watchedFields],
  );

  function addField(type: FormFieldType) {
    const id = makeFieldId();
    append({
      id,
      type,
      label: "",
      required: true,
      ...(TYPES_WITH_OPTIONS.includes(type)
        ? { options: [{ value: "opt-1", label: "" }] }
        : {}),
    } satisfies FormFieldShape);
    setLastAddedFieldId(id);
  }

  // Scroll the newly-added field into view (and softly highlight via the data
  // attribute) after React paints the new row.
  useEffect(() => {
    if (!lastAddedFieldId) return;
    const el = document.getElementById(`field-${lastAddedFieldId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setLastAddedFieldId(null);
  }, [lastAddedFieldId, fields.length]);

  async function onSubmit(values: CustomFormFormValues) {
    setSaving(true);
    const payload = {
      ...values,
      description: values.description?.trim() || undefined,
    };
    try {
      if (formId) {
        await api.patch<CustomFormSummary>(`/custom-forms/${formId}`, payload);
        toast.success(t("Forma yangilandi"));
        router.push(`/leads/forms/${formId}`);
      } else {
        const { data } = await api.post<CustomFormSummary>(
          "/custom-forms",
          payload,
        );
        toast.success(t("Forma yaratildi"));
        router.push(`/leads/forms/${data.id}`);
      }
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="pb-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {t("Orqaga")}
          </Link>
        </Button>
        {slug && <CopyFormLinkButton slug={slug} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title={t("Asosiy ma'lumotlar")}>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("Forma nomi")}</Label>
            <Input
              id="title"
              {...register("title")}
              placeholder={t("masalan: Yozgi A1 kursi uchun ro'yxatdan o'tish")}
              maxLength={150}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{customFormError(t, errors.title.message)}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("Tavsif (ixtiyoriy)")}</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder={t("Forma sarlavhasi ostida ko'rinadigan qisqa matn")}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
      </Section>

      <Section
        title={t("Forma maydonlari")}
        titleHint={t(
          "Ism, Familiya va Telefon — har qanday formada majburiy (lid yaratish uchun). Ostida o'zingiz xohlagan maydonlarni qo'shing.",
        )}
      >
        {typeof errors.fields?.message === "string" && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {customFormError(t, errors.fields.message)}
          </p>
        )}

        <div className="space-y-3">
          {fields.map((f, i) => {
            const myId = watchedFields?.[i]?.id;
            return (
              <div key={f.id} id={myId ? `field-${myId}` : undefined}>
                <FormFieldEditor
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
      </Section>

      <Section title={t("Javoblar qayerga tushadi")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("1. Ustun")}</Label>
            <Select
              value={selectedColumnId || undefined}
              onValueChange={(newColumnId) => {
                setSelectedColumnId(newColumnId);
                // Reset the section if it no longer belongs to the new column.
                const col = board.find((c) => c.id === newColumnId);
                const stillBelongs = col?.sections.some(
                  (s) => s.id === watchedSectionId,
                );
                if (!stillBelongs) {
                  setValue("sectionId", "", {
                    shouldValidate: false,
                    shouldDirty: true,
                  });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("Ustunni tanlang")} />
              </SelectTrigger>
              <SelectContent>
                {board.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {leadColumnName(col, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("2. Bo'lim")}</Label>
            <Controller
              control={control}
              name="sectionId"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  disabled={!selectedColumnId || availableSections.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        !selectedColumnId
                          ? t("Avval ustunni tanlang")
                          : availableSections.length === 0
                            ? t("Bu ustunda bo'lim yo'q")
                            : t("Bo'limni tanlang")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.sectionId && (
              <p className="text-xs text-destructive">
                {customFormError(t, errors.sectionId.message)}
              </p>
            )}
          </div>
        </div>

        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={field.value ?? true}
                onCheckedChange={(v) => field.onChange(Boolean(v))}
              />
              <Label htmlFor="isActive" className="cursor-pointer text-sm">
                {t("Forma faol")}
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  {t(
                    "O'chirilsa ochiq havola ishlamaydi va yangi javoblar qabul qilinmaydi.",
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        />
      </Section>

        </div>

        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <FormPreview
            title={watchedTitle || ""}
            description={watchedDescription || ""}
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
              onClick={() => router.push(backHref)}
              disabled={saving}
            >
              {t("Bekor qilish")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {formId ? t("Saqlash") : t("Yaratish")}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  titleHint,
  children,
}: {
  title: string;
  titleHint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border bg-background p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {titleHint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="size-3.5 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{titleHint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </section>
  );
}

function AddFieldMenu({
  onPick,
}: {
  onPick: (type: FormFieldType) => void;
}) {
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
