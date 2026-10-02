import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakdownTable } from "@/components/profile/teacher-salary-client";
import { formatNumber } from "@/lib/format-utils";
import { BreakdownRow } from "./salary-breakdown-drawer";
import type { RateBasis } from "./salary-utils";

// A3.2: oylik hisobdagi darsda FIXED_PER_STUDENT stavkasi o'quvchi boshiga
// OYIGA, undan oldingi (sikl) darslarda SIKLiga. Qaysi dars qaysi birlikda
// ekanini server hal qiladi (`rateBasis`), klient oy sanamaydi, faqat yozadi.
// Admin oynasi ham, ustozning o'z sahifasi ham shu testdan o'tadi va hech biri
// inglizcha «cycle» demaydi.

function line(salaryType: string, value: number, rateBasis?: RateBasis) {
  return {
    id: "a1",
    lessonDate: "2026-10-01T00:00:00.000Z",
    student: { id: 10001, firstName: "Ali", lastName: "Valiyev" },
    group: { id: "g1", name: "A1-01", course: { name: "Nemis tili" } },
    // Eski server rateBasis yubormaydi: kalitni umuman qo'ymaymiz.
    ...(rateBasis && { rateBasis }),
    perLessonCost: 37_500,
    amount: 37_500,
    configVersion: { salaryType, value, scope: "GLOBAL" as const },
    reversedAt: null,
    reversalReason: null,
    reversedBy: null,
  };
}

const totals = {
  accrualCount: 1,
  amountTotal: 37_500,
  reversedCount: 0,
  reversedTotal: 0,
  carriedOverCount: 0,
  carriedOverTotal: 0,
};

type Line = ReturnType<typeof line>;

const screens: [string, (l: Line) => ReactElement][] = [
  [
    "admin oynasi (BreakdownRow)",
    (l) =>
      createElement(
        "table",
        null,
        createElement(
          "tbody",
          null,
          createElement(BreakdownRow, { line: l, index: 1 }),
        ),
      ),
  ],
  [
    "ustozning o'z sahifasi (BreakdownTable)",
    (l) => createElement(BreakdownTable, { lines: [l], totals }),
  ],
];

// Qatordagi Badge matnlari: xato chiqsa ekran emas, aynan belgi ko'rinadi.
const badges = (markup: string) =>
  [...markup.matchAll(/data-slot="badge"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe.each(screens)("%s", (_name, screen) => {
  const render = (...args: Parameters<typeof line>) =>
    renderToStaticMarkup(screen(line(...args))).replace(/&#x27;/g, "'");

  it("rateBasis «month» bo'lsa stavka o'quvchi boshiga oyiga", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000, "month"))).toEqual([
      `${formatNumber(450_000)}/o'quvchi/oy`,
    ]);
  });

  it("rateBasis «cycle» bo'lsa stavka siklga", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000, "cycle"))).toEqual([
      `${formatNumber(450_000)}/tsikl`,
    ]);
  });

  it("rateBasis kelmasa (klient serverdan oldin chiqqan) «/tsikl»", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000))).toEqual([
      `${formatNumber(450_000)}/tsikl`,
    ]);
  });

  it("hech qaysi holatda inglizcha «cycle» chiqmaydi", () => {
    for (const basis of [undefined, "month", "cycle"] as const) {
      const markup = render("FIXED_PER_STUDENT", 450_000, basis);
      expect(markup.match(/.{0,20}cycle.{0,20}/i)?.[0]).toBeUndefined();
    }
  });

  it("foiz va oylik maosh belgisi rateBasis'ga qaramaydi", () => {
    expect(badges(render("PERCENTAGE", 30, "month"))).toEqual(["30%"]);
    expect(badges(render("FIXED_MONTHLY", 2_000_000, "month"))).toEqual([
      `${formatNumber(2_000_000)}/oy`,
    ]);
  });
});
