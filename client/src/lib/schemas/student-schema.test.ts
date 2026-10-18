import { describe, expect, it } from "vitest";
import {
  addStudentSchema,
  editStudentSchema,
  studentFormError,
} from "./student-schema";

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

describe("studentFormError", () => {
  const upper = (s: string) => s.toUpperCase();

  it("translates a message of the schema", () => {
    const result = editStudentSchema.safeParse({
      firstName: "A",
      lastName: "Valiyev",
      phone: "901234567",
    });
    expect(result.success).toBe(false);
    const message = result.error?.issues[0].message;
    expect(message).toBe("Ism kamida 2 ta belgidan iborat bo'lishi kerak");
    expect(studentFormError(upper, message)).toBe(
      "ISM KAMIDA 2 TA BELGIDAN IBORAT BO'LISHI KERAK",
    );
  });

  it("leaves a message that is not the schema's own as it came", () => {
    expect(studentFormError(upper, "Invalid input")).toBe("Invalid input");
  });

  it("keeps a missing message missing", () => {
    expect(studentFormError(upper, undefined)).toBeUndefined();
  });
});
