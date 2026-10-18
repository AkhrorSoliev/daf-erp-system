import { describe, expect, it } from "vitest";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";
import { firstInvalidId } from "./public-form-scroll";

const f = (id: string): FormFieldShape =>
  ({ id, type: "text", label: id, required: true }) as FormFieldShape;

describe("firstInvalidId", () => {
  it("finds the first invalid field in form order, not error order", () => {
    expect(firstInvalidId([f("a"), f("b"), f("c")], { c: {}, b: {} })).toBe("b");
  });
  it("is undefined when nothing is invalid", () => {
    expect(firstInvalidId([f("a")], {})).toBeUndefined();
  });
});
