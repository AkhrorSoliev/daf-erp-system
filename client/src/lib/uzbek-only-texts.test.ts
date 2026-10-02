import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_KPI_TOOLTIPS,
  ATTENDANCE_TABLE_TOOLTIPS,
} from "@/components/reports/attendance/metric-helpers";
import {
  KPI_TOOLTIPS,
  TABLE_TOOLTIPS,
} from "@/components/reports/center-activity/metric-helpers";

// The CEO's rule (27.09.2026): a file the A3 plan touched keeps no visible
// English. These are the texts that slipped through the first pass: status
// enum names and jargon inside tooltips, and a few lines inside stateful
// components that a static render cannot draw.

// Status enum names and the English words the plan replaced.
const ENGLISH =
  /\b(ACTIVE|FROZEN|DROPPED|TRANSFERRED|COMPLETED|PRESENT|ABSENT|KPI|enrollment|slots?|preview|submission|feature)\b/i;

describe("report tooltips", () => {
  it.each([
    ["ATTENDANCE_KPI_TOOLTIPS", ATTENDANCE_KPI_TOOLTIPS],
    ["ATTENDANCE_TABLE_TOOLTIPS", ATTENDANCE_TABLE_TOOLTIPS],
    ["KPI_TOOLTIPS", KPI_TOOLTIPS],
    ["TABLE_TOOLTIPS", TABLE_TOOLTIPS],
  ])("%s carries no status enum name and no English jargon", (_name, tooltips) => {
    for (const [key, text] of Object.entries(tooltips)) {
      expect(text, key).not.toMatch(ENGLISH);
    }
  });

  it("the retention tooltip says who counts in a group and who has left, in Uzbek", () => {
    expect(ATTENDANCE_KPI_TOOLTIPS.retention).toContain(
      "Guruhda hisoblanadi = faol yoki muzlatilgan. Ketgan = chiqdi, o'tkazildi yoki tugallangan.",
    );
  });
});

// Reads a component's source the way `payments-overview.test.ts` does for the
// tooltips a closed card hides. Whitespace is collapsed (JSX wraps its lines)
// and `&apos;` read back as the apostrophe it stands for.
function source(file: string): string {
  return readFileSync(join(__dirname, "..", "components", file), "utf-8")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ");
}

describe("texts inside stateful components", () => {
  it("the form builder's «Faol» tooltip says «ochiq havola» and «javoblar»", () => {
    const text = source("forms/form-builder-client.tsx");

    expect(text).toContain(
      "O'chirilsa ochiq havola ishlamaydi va yangi javoblar qabul qilinmaydi.",
    );
    expect(text).not.toContain("public havola");
    expect(text).not.toContain("submission qabul");
  });

  it("the unlink confirmation says «uzildi» and «bazada»", () => {
    const text = source("settings/telegram-groups-client.tsx");

    expect(text).toContain(
      "guruhidan tizim darajasida uzildi. Guruh bazada arxivlanadi, lekin bot guruhda qoladi — uni qo'lda chiqarib yuborishingiz mumkin.",
    );
    expect(text).not.toContain("uzladi");
    expect(text).not.toContain("DB'da");
  });

  it("the write-off dialog names the two attendance kinds in Uzbek", () => {
    const text = source("students/write-off-debt-dialog.tsx");

    expect(text).toContain("Qatnashgan (keldi, kechikdi):");
    expect(text).toContain("Kelmagan (sababsiz):");
    expect(text).not.toMatch(/\(PRESENT\/LATE\)|\(ABSENT\)/);
  });
});
