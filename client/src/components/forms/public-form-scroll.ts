import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

/** The first field (in form order) that has an error, or undefined. */
export function firstInvalidId(
  fields: FormFieldShape[],
  errors: Record<string, unknown>,
): string | undefined {
  return fields.find((f) => errors[f.id])?.id;
}
