import { describe, expect, it } from "vitest";
import { radioOvozHolati } from "./radio-store";

describe("radioOvozHolati", () => {
  it("radio hali yoqilmagan (element yaratilmagan) — null", () => {
    expect(radioOvozHolati()).toBeNull();
  });
});
