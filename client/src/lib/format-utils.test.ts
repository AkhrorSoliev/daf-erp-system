import { describe, expect, it } from "vitest";
import { formatPhoneWithCodeInput } from "./format-utils";

describe("formatPhoneWithCodeInput", () => {
  it("groups an Uzbek number as XXX XX XXX XX XX", () => {
    expect(formatPhoneWithCodeInput("998901234567")).toBe("998 90 123 45 67");
  });

  it("formats while the number is still half-typed", () => {
    expect(formatPhoneWithCodeInput("9")).toBe("9");
    expect(formatPhoneWithCodeInput("9989")).toBe("998 9");
    expect(formatPhoneWithCodeInput("99890123")).toBe("998 90 123");
  });

  it("ignores anything the user pastes that is not a digit", () => {
    expect(formatPhoneWithCodeInput("+998 (90) 123-45-67")).toBe(
      "998 90 123 45 67",
    );
  });

  // Sign-in must keep working for foreign accounts, whose country code is part
  // of the stored identifier — extra digits are appended, never cut off.
  it("keeps every digit of a foreign number", () => {
    expect(formatPhoneWithCodeInput("491749493338")).toBe("491 74 949 33 38");
    expect(formatPhoneWithCodeInput("4917494933385")).toBe(
      "491 74 949 33 38 5",
    );
    expect(formatPhoneWithCodeInput("4930")).toBe("493 0");
  });

  it("stops at the E.164 limit of 15 digits", () => {
    expect(formatPhoneWithCodeInput("1234567890123456789")).toBe(
      "123 45 678 90 12 345",
    );
  });
});
