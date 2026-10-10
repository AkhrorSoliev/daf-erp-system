import { describe, expect, it } from "vitest";
import { isOwnPayrollLocked } from "./own-payroll";

const DIRECTOR = { id: 10012, roles: [{ id: 2 }] };
const CEO = { id: 10001, roles: [{ id: 1 }] };

describe("isOwnPayrollLocked", () => {
  it("never locks someone else's row", () => {
    expect(isOwnPayrollLocked(10500, DIRECTOR)).toBe(false);
  });

  it("locks a non-CEO's own row", () => {
    expect(isOwnPayrollLocked(10012, DIRECTOR)).toBe(true);
  });

  it("leaves the CEO's own row open, whatever else they hold", () => {
    expect(isOwnPayrollLocked(10001, CEO)).toBe(false);
    expect(
      isOwnPayrollLocked(10001, { id: 10001, roles: [{ id: 4 }, { id: 1 }] }),
    ).toBe(false);
  });

  it("locks nothing before the session or the payee is known", () => {
    expect(isOwnPayrollLocked(10012, null)).toBe(false);
    expect(isOwnPayrollLocked(undefined, DIRECTOR)).toBe(false);
  });
});
