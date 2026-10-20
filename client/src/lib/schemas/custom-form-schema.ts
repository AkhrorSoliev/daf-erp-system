import { z } from "zod";
import { msg } from "@/i18n/msg";

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

// Validation texts are `msg()` markers: the builder draws them with `t(…)`
// through `customFormError`, so they follow the page language. One whole
// sentence per lead slot, so no translation has to glue a suffix to a word.
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
const TITLE_EMPTY = msg("Forma nomi bo'sh bo'lmasin");
const SECTION_REQUIRED = msg("Bo'limni tanlang");
const FIELD_MIN = msg("Kamida bitta maydon qo'shing");
const IDS_UNIQUE = msg("Maydon identifikatorlari takrorlanmasligi kerak");
const OPTION_MIN = msg("Kamida bitta variant qo'shing");
const MAPPED_REQUIRED = msg("Lid maydoniga bog'langan maydon majburiy bo'lishi kerak");
const PHONE_TYPE = msg("Telefon maydonining turi «Telefon» bo'lishi kerak");

const CUSTOM_FORM_TEXTS = new Set<string>([
  ...Object.values(SLOT_MISSING),
  ...Object.values(SLOT_DUPLICATE),
  OPTION_VALUE_EMPTY,
  OPTION_LABEL_EMPTY,
  FIELD_LABEL_EMPTY,
  TITLE_EMPTY,
  SECTION_REQUIRED,
  FIELD_MIN,
  IDS_UNIQUE,
  OPTION_MIN,
  MAPPED_REQUIRED,
  PHONE_TYPE,
]);

/**
 * The text of a builder error in the page language. Only this file's own
 * messages go through `t`; any other message (a zod default) is shown as it
 * came, so `uz-Cyrl` never transliterates it.
 */
export function customFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return CUSTOM_FORM_TEXTS.has(message) ? t(message) : message;
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

export type FormFieldShape = z.infer<typeof fieldSchema>;

export const customFormSchema = z
  .object({
    title: z.string().min(1, TITLE_EMPTY).max(150),
    description: z.string().max(1000).optional(),
    sectionId: z.string().min(1, SECTION_REQUIRED),
    fields: z.array(fieldSchema).min(1, FIELD_MIN).max(40),
    isActive: z.boolean().optional(),
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

      if (TYPES_WITH_OPTIONS.includes(f.type) && (!f.options || f.options.length === 0)) {
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
        if (!match.required) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", data.fields.indexOf(match), "required"],
            message: MAPPED_REQUIRED,
          });
        }
        if (slot === "phone" && match.type !== "phone") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", data.fields.indexOf(match), "type"],
            message: PHONE_TYPE,
          });
        }
      }
    }
  });

export type CustomFormFormValues = z.infer<typeof customFormSchema>;

// Sensible defaults — every new form starts with the three required Lead
// fields already mapped, so admins only need to add their custom fields.
//
// These three ids are FIXED, not `makeFieldId()`-random: `defaultFormFields()`
// runs inside `useForm({ defaultValues: {...} })` in `form-builder-client.tsx`,
// which Next.js evaluates once during the server render and again during
// client hydration. A random id there produced a different value each time,
// so the server-rendered `field-<id>` DOM attributes never matched the
// client's — a hydration mismatch on every fresh load of `/leads/forms/new`.
// A fixed id only needs to be unique among the three defaults, which a
// literal string already guarantees; `addField()` below still calls
// `makeFieldId()` for fields added after mount (a client-only event, so no
// SSR/CSR mismatch risk there).
export function defaultFormFields(): FormFieldShape[] {
  return [
    {
      id: "default-first-name",
      type: "text",
      label: "Ismingiz",
      required: true,
      mapsTo: "firstName",
    },
    {
      id: "default-last-name",
      type: "text",
      label: "Familiyangiz",
      required: true,
      mapsTo: "lastName",
    },
    {
      id: "default-phone",
      type: "phone",
      label: "Telefon raqamingiz",
      required: true,
      mapsTo: "phone",
    },
  ];
}

const FIELD_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function makeFieldId(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += FIELD_ID_ALPHABET[Math.floor(Math.random() * FIELD_ID_ALPHABET.length)];
  }
  return out;
}
