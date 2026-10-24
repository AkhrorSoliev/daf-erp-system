import { z } from "zod";
import { msg } from "@/i18n/msg";

// Mock exam form field schema. Mirrors the lead `CustomForm` field shape
// (see custom-form-schema.ts) because the Telegram bot in Faza 4 collects
// answers identically — we deliberately duplicated rather than touched the
// existing lead schema to avoid regression risk on a shipping feature.

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "select",
  "radio",
  "checkbox",
  "date",
] as const;

export type FormFieldType = (typeof FIELD_TYPES)[number];

export const TYPES_WITH_OPTIONS: FormFieldType[] = ["select", "radio"];

export const MAPS_TO_VALUES = ["firstName", "lastName", "phone"] as const;
export type MapsToValue = (typeof MAPS_TO_VALUES)[number];

// Field type names are `msg()` texts: the builder draws them with `t(…)`.
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: msg("Matn (qisqa)"),
  textarea: msg("Matn (uzun)"),
  number: msg("Son"),
  email: msg("Elektron pochta"),
  phone: msg("Telefon"),
  select: msg("Tanlash (ochiladigan ro'yxat)"),
  radio: msg("Variantlar (bittasini tanlash)"),
  checkbox: msg("Belgilash (bir nechtasini tanlash)"),
  date: msg("Sana"),
};

// Validation texts are `msg()` markers drawn through `mockExamFormError`, so
// they follow the page language. One whole sentence per slot, as in
// `custom-form-schema.ts`.
const SLOT_MISSING: Record<MapsToValue, string> = {
  firstName: msg("Ism maydoni majburiy — biror maydonni \"Ism\"ga bog'lang"),
  lastName: msg("Familiya maydoni majburiy — biror maydonni \"Familiya\"ga bog'lang"),
  phone: msg("Telefon maydoni majburiy — biror maydonni \"Telefon\"ga bog'lang"),
};
const SLOT_DUPLICATE: Record<MapsToValue, string> = {
  firstName: msg("Ismga faqat bitta maydon bog'lanishi mumkin"),
  lastName: msg("Familiyaga faqat bitta maydon bog'lanishi mumkin"),
  phone: msg("Telefonga faqat bitta maydon bog'lanishi mumkin"),
};
const OPTION_VALUE_EMPTY = msg("Variant qiymati bo'sh bo'lmasin");
const OPTION_LABEL_EMPTY = msg("Variant nomi bo'sh bo'lmasin");
const FIELD_LABEL_EMPTY = msg("Maydon nomi bo'sh bo'lmasin");
const FIELD_MIN = msg("Kamida bitta maydon qo'shing");
const FIELD_MAX = msg("Eng ko'pi bilan 40 maydon");
const IDS_UNIQUE = msg("Maydon identifikatorlari takrorlanmasligi kerak");
const OPTION_MIN = msg("Kamida bitta variant qo'shing");
const MAPPED_REQUIRED = msg("Maydon majburiy bo'lishi kerak");
const PHONE_TYPE = msg("Telefon maydonining turi «Telefon» bo'lishi kerak");

const MOCK_FORM_TEXTS = new Set<string>([
  ...Object.values(SLOT_MISSING),
  ...Object.values(SLOT_DUPLICATE),
  OPTION_VALUE_EMPTY,
  OPTION_LABEL_EMPTY,
  FIELD_LABEL_EMPTY,
  FIELD_MIN,
  FIELD_MAX,
  IDS_UNIQUE,
  OPTION_MIN,
  MAPPED_REQUIRED,
  PHONE_TYPE,
]);

/** A builder error in the page language; any other message is shown as it came. */
export function mockExamFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return MOCK_FORM_TEXTS.has(message) ? t(message) : message;
}

const optionSchema = z.object({
  value: z.string().min(1, OPTION_VALUE_EMPTY).max(100),
  label: z.string().min(1, OPTION_LABEL_EMPTY).max(200),
});

const fieldSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1, FIELD_LABEL_EMPTY).max(200),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
  options: z.array(optionSchema).optional(),
  mapsTo: z.enum(MAPS_TO_VALUES).optional(),
});

export type MockExamFormFieldShape = z.infer<typeof fieldSchema>;

export const mockExamFormSchema = z
  .object({
    fields: z
      .array(fieldSchema)
      .min(1, FIELD_MIN)
      .max(40, FIELD_MAX),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const [i, f] of data.fields.entries()) {
      if (ids.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "id"],
          message: IDS_UNIQUE,
        });
      }
      ids.add(f.id);

      if (
        TYPES_WITH_OPTIONS.includes(f.type) &&
        (!f.options || f.options.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "options"],
          message: OPTION_MIN,
        });
      }
    }

    for (const slot of MAPS_TO_VALUES) {
      const matches = data.fields.filter((f) => f.mapsTo === slot);
      if (matches.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields"],
          message: SLOT_MISSING[slot],
        });
      } else if (matches.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields"],
          message: SLOT_DUPLICATE[slot],
        });
      } else {
        const match = matches[0];
        const matchIdx = data.fields.indexOf(match);
        if (!match.required) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", matchIdx, "required"],
            message: MAPPED_REQUIRED,
          });
        }
        if (slot === "phone" && match.type !== "phone") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", matchIdx, "type"],
            message: PHONE_TYPE,
          });
        }
      }
    }
  });

export type MockExamFormValues = z.infer<typeof mockExamFormSchema>;

const FIELD_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function makeFieldId(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out +=
      FIELD_ID_ALPHABET[Math.floor(Math.random() * FIELD_ID_ALPHABET.length)];
  }
  return out;
}

export function defaultMockExamFormFields(): MockExamFormFieldShape[] {
  return [
    {
      id: makeFieldId(),
      type: "text",
      label: "Ismingiz",
      required: true,
      mapsTo: "firstName",
    },
    {
      id: makeFieldId(),
      type: "text",
      label: "Familiyangiz",
      required: true,
      mapsTo: "lastName",
    },
    {
      id: makeFieldId(),
      type: "phone",
      label: "Telefon raqamingiz",
      required: true,
      mapsTo: "phone",
    },
  ];
}
