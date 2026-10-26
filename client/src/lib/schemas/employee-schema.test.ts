import { describe, expect, it } from "vitest";
import { employeeSchema, officialSalaryOf } from "./employee-schema";

const base = {
  firstName: "Ali",
  lastName: "Valiyev",
  phone: "",
  position: "Kassir",
  roleIds: [3],
  branchIds: [1],
  isEdit: true,
};

describe("employeeSchema.officialSalary", () => {
  it("takes digits or nothing", () => {
    expect(employeeSchema.safeParse({ ...base, officialSalary: "2000000" }).success).toBe(true);
    expect(employeeSchema.safeParse({ ...base, officialSalary: "" }).success).toBe(true);
    expect(employeeSchema.safeParse(base).success).toBe(true);
  });

  it("refuses anything but digits", () => {
    const res = employeeSchema.safeParse({ ...base, officialSalary: "2 000 abc" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].path).toEqual(["officialSalary"]);
      expect(res.error.issues[0].message).toBe("Faqat raqam");
    }
  });
});

describe("officialSalaryOf", () => {
  it("is a number when filled, undefined (do not send) when empty", () => {
    expect(officialSalaryOf("2000000")).toBe(2_000_000);
    expect(officialSalaryOf("0")).toBe(0);
    expect(officialSalaryOf("")).toBeUndefined();
    expect(officialSalaryOf(undefined)).toBeUndefined();
  });

  it("sends 0 (all cash) when an employee who had a value empties the field", () => {
    expect(officialSalaryOf("", true)).toBe(0);
    expect(officialSalaryOf(undefined, true)).toBe(0);
    expect(officialSalaryOf("", false)).toBeUndefined();
    expect(officialSalaryOf("1500000", true)).toBe(1_500_000);
  });
});
