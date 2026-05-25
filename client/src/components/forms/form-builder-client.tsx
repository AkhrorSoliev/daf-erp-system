"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ClipboardCopy, HelpCircle, Loader2, Plus } from "lucide-react";
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import {
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

interface LeadSourceLite {
  id: string;
  name: string;
}

interface Props {
  formId?: string;
}

function buildPublicLink(slug: string): string {
  if (typeof window === "undefined") return `/f/${slug}`;
  const host = window.location.hostname;
  if (host.endsWith(".dafzentrum.uz")) {
    return `https://form.dafzentrum.uz/${slug}`;
  }
  return `${window.location.origin}/f/${slug}`;
}

async function copyLink(slug: string) {
  try {
    await navigator.clipboard.writeText(buildPublicLink(slug));
    toast.success("Havola nusxalandi");
  } catch {
    toast.error("Nusxalashda xatolik");
  }
}

export function FormBuilderClient({ formId }: Props) {
  const router = useRouter();
  const board = useLeadsBoard((s) => s.board);
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);

  const [sources, setSources] = useState<LeadSourceLite[]>([]);
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
      sourceId: "",
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
    api
      .get<LeadSourceLite[]>("/lead-sources")
      .then(({ data }) => setSources(data))
      .catch(() => setSources([]));
  }, [board.length, fetchBoard]);

  useEffect(() => {
    if (!formId) return;
    setLoading(true);
    api
      .get<CustomFormDetail>(`/custom-forms/${formId}`)
      .then(({ data }) => {
        setSlug(data.slug);
        reset({
          title: data.title,
          description: data.description ?? "",
          sectionId: data.sectionId,
          sourceId: data.sourceId ?? "",
          fields: data.fields,
          isActive: data.isActive,
        });
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Formani yuklashda xatolik"));
        router.push("/leads/forms");
      })
      .finally(() => setLoading(false));
  }, [formId, reset, router]);

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
      sourceId: values.sourceId?.trim() || undefined,
    };
    try {
      if (formId) {
        const { data } = await api.patch<CustomFormSummary>(
          `/custom-forms/${formId}`,
          payload,
        );
        setSlug(data.slug);
        toast.success("Forma yangilandi");
      } else {
        const { data } = await api.post<CustomFormSummary>(
          "/custom-forms",
          payload,
        );
        toast.success("Forma yaratildi");
        router.replace(`/leads/forms/${data.id}`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik"));
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
          <Link href="/leads/forms">
            <ArrowLeft className="size-4" />
            Orqaga
          </Link>
        </Button>
        {slug && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyLink(slug)}
          >
            <ClipboardCopy className="size-3.5" />
            Public havolani nusxalash
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title="Asosiy ma'lumotlar">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Forma nomi</Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="masalan: Yozgi A1 kursi uchun ro'yxatdan o'tish"
              maxLength={150}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Tavsif (ixtiyoriy)</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Forma sarlavhasi ostida ko'rinadigan qisqa matn"
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Forma maydonlari"
        titleHint="Ism, Familya va Telefon — har qanday formada majburiy (lid yaratish uchun). Ostida o'zingiz xohlagan maydonlarni qo'shing."
      >
        {typeof errors.fields?.message === "string" && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errors.fields.message}
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

      <Section title="Submission qayerga tushadi">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>1. Ustun</Label>
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
                <SelectValue placeholder="Ustun tanlang" />
              </SelectTrigger>
              <SelectContent>
                {board.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>2. Bo&apos;lim</Label>
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
                          ? "Avval ustun tanlang"
                          : availableSections.length === 0
                            ? "Bu ustunda bo'lim yo'q"
                            : "Bo'lim tanlang"
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
                {errors.sectionId.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <LabelWithHint
            label="Lid manbasi (ixtiyoriy)"
            hint="Lid qayerdan kelganini belgilaydi (Instagram, Telegram va hokazo) — hisobotlarda formalar bo'yicha samaradorlikni ko'rish uchun."
          />
          <Controller
            control={control}
            name="sourceId"
            render={({ field }) => (
              <Select
                value={field.value || "none"}
                onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Manba tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— (yo&apos;q)</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
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
                Faol
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  O&apos;chirilsa public havola ishlamaydi va yangi
                  submission qabul qilinmaydi.
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
            {isDirty && !saving ? "Saqlanmagan o'zgarishlar" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/leads/forms")}
              disabled={saving}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {formId ? "Saqlash" : "Yaratish"}
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

function LabelWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="size-3.5 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function AddFieldMenu({
  onPick,
}: {
  onPick: (type: FormFieldType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <Plus className="size-4" />
          Maydon qo&apos;shish
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {FIELD_TYPES.map((t) => {
          const Icon = ADD_FIELD_TYPE_ICONS[t];
          return (
            <DropdownMenuItem key={t} onClick={() => onPick(t)}>
              <Icon className="mr-2 size-4" />
              {FIELD_TYPE_LABELS[t]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
