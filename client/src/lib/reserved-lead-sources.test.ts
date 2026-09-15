import { describe, expect, it } from "vitest";
import { isReservedLeadSource } from "./reserved-lead-sources";

describe("isReservedLeadSource", () => {
  it.each(["Telegram bot", "  telegram BOT ", "Mock imtihon"])(
    "tizim manbasi: %s",
    (name) => {
      expect(isReservedLeadSource(name)).toBe(true);
    },
  );

  it.each(["Telegram", "Instagram", "Tanishlar", "reklama_sentyabr"])(
    "oddiy manba: %s",
    (name) => {
      expect(isReservedLeadSource(name)).toBe(false);
    },
  );
});
