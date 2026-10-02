import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakdownTable } from "@/components/profile/teacher-salary-client";
import { formatNumber } from "@/lib/format-utils";
import type { PaymentModel } from "@/lib/payment-model";
import { BreakdownRow } from "./salary-breakdown-drawer";

// A3.2: oylik kursda FIXED_PER_STUDENT stavkasi o'quvchi boshiga OYIGA, sikl
// kursida esa SIKLiga. Admin oynasi ham, ustozning o'z sahifasi ham shu belgini
// yozadi — ikkalasi ham shu testdan o'tadi va hech biri inglizcha «cycle» demaydi.

function line(salaryType: string, value: number, paymentModel?: PaymentModel) {
  return {
    id: "a1",
    lessonDate: "2026-10-01T00:00:00.000Z",
    student: { id: 10001, firstName: "Ali", lastName: "Valiyev" },
    group: {
      id: "g1",
      name: "A1-01",
      // Eski server paymentModel yubormaydi: kalitni umuman qo'ymaymiz.
      course: { name: "Nemis tili", ...(paymentModel && { paymentModel }) },
    },
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

  it("oylik kursda stavka o'quvchi boshiga oyiga", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000, "MONTHLY"))).toEqual([
      `${formatNumber(450_000)}/o'quvchi/oy`,
    ]);
  });

  it("sikl kursida stavka siklga", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000, "LESSON_PACK"))).toEqual(
      [`${formatNumber(450_000)}/tsikl`],
    );
  });

  it("paymentModel kelmasa (klient serverdan oldin chiqqan) «/tsikl»", () => {
    expect(badges(render("FIXED_PER_STUDENT", 450_000))).toEqual([
      `${formatNumber(450_000)}/tsikl`,
    ]);
  });

  it("hech qaysi holatda inglizcha «cycle» chiqmaydi", () => {
    for (const model of [undefined, "MONTHLY", "LESSON_PACK"] as const) {
      const markup = render("FIXED_PER_STUDENT", 450_000, model);
      expect(markup.match(/.{0,20}cycle.{0,20}/i)?.[0]).toBeUndefined();
    }
  });

  it("foiz va oylik maosh belgisi o'zgarmaydi", () => {
    expect(badges(render("PERCENTAGE", 30, "MONTHLY"))).toEqual(["30%"]);
    expect(badges(render("FIXED_MONTHLY", 2_000_000, "MONTHLY"))).toEqual([
      `${formatNumber(2_000_000)}/oy`,
    ]);
  });
});
