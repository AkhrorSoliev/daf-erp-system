import { describe, expect, it } from "vitest";
import { isOwnAccount, withoutOwnSignInKeys } from "./own-sign-in-keys";

describe("isOwnAccount", () => {
  it("is true only when the employee being edited is the signed-in user", () => {
    expect(isOwnAccount(10, 10)).toBe(true);
    expect(isOwnAccount(10, 11)).toBe(false);
  });

  it("is false while creating a new employee or before the session loads", () => {
    expect(isOwnAccount(undefined, 10)).toBe(false);
    expect(isOwnAccount(10, undefined)).toBe(false);
  });
});

describe("withoutOwnSignInKeys", () => {
  const payload = {
    firstName: "Akmal",
    phone: "901112233",
    login: "akmal",
    password: "secret1",
    position: "Admin",
  };

  it("drops phone, login and password from your own record", () => {
    expect(withoutOwnSignInKeys(payload, true)).toEqual({
      firstName: "Akmal",
      position: "Admin",
    });
  });

  it("leaves someone else's record alone", () => {
    expect(withoutOwnSignInKeys(payload, false)).toEqual(payload);
  });

  it("does not mutate the payload it was given", () => {
    const before = { ...payload };
    withoutOwnSignInKeys(payload, true);
    expect(payload).toEqual(before);
  });
});
