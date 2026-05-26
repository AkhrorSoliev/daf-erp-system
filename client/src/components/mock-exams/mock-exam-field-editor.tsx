"use client";

import {
  Plus,
  Trash2,
  Type as TypeIcon,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  ListChecks,
  CircleDot,
  CheckSquare,
  Calendar,
} from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FIELD_TYPE_LABELS,
  TYPES_WITH_OPTIONS,
  type MockExamFormValues,
  type FormFieldType,
} from "@/lib/schemas/mock-exam-form-schema";

interface Props {
  control: Control<MockExamFormValues>;
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}

const TYPE_ICONS: Record<
  FormFieldType,
  React.ComponentType<{ className?: string }>
> = {
  text: TypeIcon,
  textarea: AlignLeft,
  number: Hash,
  email: Mail,
  phone: Phone,
  select: ListChecks,
  radio: CircleDot,
  checkbox: CheckSquare,
  date: Calendar,
};

export function MockExamFieldEditor({
  control,
  index,
  onRemove,
  canRemove,
}: Props) {
  const fieldType = useWatch({
    control,
    name: `fields.${index}.type`,
  }) as FormFieldType;

  const showOptions = TYPES_WITH_OPTIONS.includes(fieldType);

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-start gap-2 border-b px-3 py-2.5">
        <div className="flex flex-1 flex-col gap-2">
          <Controller
            control={control}
            name={`fields.${index}.label`}
            render={({ field, fieldState }) => (
              <div className="flex-1 min-w-40">
                <Input
                  {...field}
                  placeholder="Foydalanuvchiga ko'rinadigan nom"
                  maxLength={200}
                />
                {fieldState.error?.message && (
                  <p className="mt-1 text-xs text-destructive">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-destructive hover:text-destructive disabled:opacity-30"
          onClick={onRemove}
          disabled={!canRemove}
          title={
            canRemove
              ? "Maydonni o'chirish"
              : "Asosiy maydonlarni (ism/familya/telefon) o'chirib bo'lmaydi"
          }
        >
          <Trash2 className="size-4" />
          <span className="sr-only">O&apos;chirish</span>
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          Tur:{" "}
          <span className="font-medium text-foreground">
            {FIELD_TYPE_LABELS[fieldType]}
          </span>
        </span>
      </div>

      {showOptions && (
        <div className="px-3 py-2.5">
          <OptionsEditor control={control} fieldIndex={index} />
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  control,
  fieldIndex,
}: {
  control: Control<MockExamFormValues>;
  fieldIndex: number;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `fields.${fieldIndex}.options`,
  });

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Variantlar
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() =>
            append({ value: `opt-${fields.length + 1}`, label: "" })
          }
        >
          <Plus className="size-3.5" />
          Variant qo&apos;shish
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Variant yo&apos;q — kamida bittasini qo&apos;shing
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((opt, optIdx) => (
            <li key={opt.id} className="flex items-center gap-2">
              <Controller
                control={control}
                name={`fields.${fieldIndex}.options.${optIdx}.label`}
                render={({ field }) => (
                  <Input
                    {...field}
                    className="h-8 flex-1"
                    placeholder="Ko'rinadigan matn"
                    maxLength={200}
                  />
                )}
              />
              <Controller
                control={control}
                name={`fields.${fieldIndex}.options.${optIdx}.value`}
                render={({ field }) => (
                  <Input
                    {...field}
                    className="h-8 w-32"
                    placeholder="qiymat"
                    maxLength={100}
                  />
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive"
                onClick={() => remove(optIdx)}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Variantni o&apos;chirish</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const ADD_FIELD_TYPE_ICONS = TYPE_ICONS;
