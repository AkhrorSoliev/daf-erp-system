import { describe, expect, it } from "vitest";
import { addStudentSchema } from "./student-schema";

describe("addStudentSchema", () => {
  const base = {
    firstName: "Ali",
    lastName: "Valiyev",
    phone: "901234567",
  };

  it("manba tanlanmasa rad etadi", () => {
    const result = addStudentSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("manba tanlansa qabul qiladi", () => {
    const result = addStudentSchema.safeParse({
      ...base,
      sourceId: "src-instagram",
    });
    expect(result.success).toBe(true);
  });
});
