import { z } from "zod";

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

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Matn (qisqa)",
  textarea: "Matn (uzun)",
  number: "Son",
  email: "Email",
  phone: "Telefon",
  select: "Tanlash (dropdown)",
  radio: "Variantlar (radio)",
  checkbox: "Belgilash (checkbox)",
  date: "Sana",
};

export const MAPS_TO_LABELS: Record<MapsToValue, string> = {
  firstName: "Ism",
  lastName: "Familya",
  phone: "Telefon",
};

const optionSchema = z.object({
  value: z.string().min(1, "Variant qiymati bo'sh bo'lmasin").max(100),
  label: z.string().min(1, "Variant nomi bo'sh bo'lmasin").max(200),
});

const fieldSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1, "Maydon nomi bo'sh bo'lmasin").max(200),
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
      .min(1, "Kamida bitta maydon qo'shing")
      .max(40, "Eng ko'pi bilan 40 maydon"),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const [i, f] of data.fields.entries()) {
      if (ids.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "id"],
          message: "Maydon identifikatorlari takrorlanmasligi kerak",
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
          message: "Kamida bitta variant qo'shing",
        });
      }
    }

    for (const slot of MAPS_TO_VALUES) {
      const matches = data.fields.filter((f) => f.mapsTo === slot);
      if (matches.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields"],
          message: `${MAPS_TO_LABELS[slot]} maydoni majburiy — biror maydonni "${MAPS_TO_LABELS[slot]}" ga bog'lang`,
        });
      } else if (matches.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields"],
          message: `${MAPS_TO_LABELS[slot]} ga faqat bitta maydon bog'lanishi mumkin`,
        });
      } else {
        const match = matches[0];
        const matchIdx = data.fields.indexOf(match);
        if (!match.required) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", matchIdx, "required"],
            message: "Maydon majburiy bo'lishi kerak",
          });
        }
        if (slot === "phone" && match.type !== "phone") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", matchIdx, "type"],
            message: "Telefon maydonining turi 'phone' bo'lishi kerak",
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
      label: "Familyangiz",
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
