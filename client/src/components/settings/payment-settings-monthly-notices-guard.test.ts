import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-text guard, like the debt write-off one: the client tests render no
// components, so this switch — the only way to stop the monthly payment
// messages without a deploy — could vanish with tsc, eslint, vitest and the
// build all green.
const SOURCE = readFileSync(
  join(__dirname, "payment-settings-client.tsx"),
  "utf-8",
);

describe("payment.monthlyNoticesEnabled sozlamasi UI'da", () => {
  it("PaymentSettingsValues kaliti e'lon qilingan", () => {
    expect(SOURCE).toContain('"payment.monthlyNoticesEnabled": boolean;');
  });

  it("Switch sozlama qiymatiga bog'langan va saveField orqali saqlanadi", () => {
    expect(SOURCE).toContain(
      'checked={settings["payment.monthlyNoticesEnabled"]}',
    );
    expect(SOURCE).toContain("saveField({ monthlyNoticesEnabled: checked })");
  });

  it("tugma FAQAT CEO uchun ochiq", () => {
    const row = SOURCE.slice(
      SOURCE.indexOf('checked={settings["payment.monthlyNoticesEnabled"]}'),
    ).slice(0, 300);
    expect(row).toContain("disabled={!isCeo || saving}");
  });

  it("CEO ko'radigan nom joyida", () => {
    expect(SOURCE).toContain("O'quvchiga oylik to'lov xabari");
  });
});
