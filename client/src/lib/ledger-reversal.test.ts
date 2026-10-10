import { describe, expect, it } from "vitest";
import { reversalNote } from "./ledger-reversal";

// Midday UTC, so the day is the same in every time zone the tests run in.
const at = (day: string) => `${day}T10:00:00.000Z`;

describe("reversalNote", () => {
  it("says when a cancelled row was cancelled, and why", () => {
    expect(
      reversalNote({
        kind: "reversed",
        at: at("2026-09-25"),
        reason: "Oylik to'lovga o'tish migratsiyasi — 2026-09",
      }),
    ).toBe(
      "25.09.2026 da bekor qilingan: Oylik to'lovga o'tish migratsiyasi — 2026-09",
    );
  });

  it("names the row a cancellation undid", () => {
    expect(
      reversalNote({
        kind: "undo",
        originalAt: at("2026-09-18"),
        originalAmount: -37500,
        reason: "Davomat holati o'zgardi",
      }).replace(/\u00a0/g, " "),
    ).toBe("18.09.2026 dagi -37 500 so'm bekor qilindi: Davomat holati o'zgardi");
  });

  it("leaves the reason out when there is none, or when asked to", () => {
    expect(
      reversalNote({ kind: "reversed", at: at("2026-09-25"), reason: null }),
    ).toBe("25.09.2026 da bekor qilingan");
    expect(
      reversalNote(
        { kind: "reversed", at: at("2026-09-25"), reason: "profil 2ta" },
        { withReason: false },
      ),
    ).toBe("25.09.2026 da bekor qilingan");
  });
});
