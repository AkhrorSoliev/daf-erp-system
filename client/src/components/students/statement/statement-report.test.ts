import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatementReport } from "./statement-report";
import { LessonDayChips } from "./statement-months-table";
import type { StatementResponse, StatementView } from "./statement-types";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");

const view = (over: Partial<StatementView> = {}): StatementView => ({
  title: "To'lovlar hisoboti",
  studentLine: "Test O'quvchi · ID 10001 · #001 guruh",
  asOfLine: "DaF Sprachzentrum · 26.09.2026 holatiga",
  answer: {
    tone: "debt",
    title: "Qarzi: 150 000 so'm",
    subtitle: "sentabr darslari uchun 150 000",
  },
  equation: [
    { text: "To'lagan " },
    { text: "200 000", bold: true },
    { text: " = " },
    { text: "−150 000", bold: true, tone: "red" },
  ],
  packHint: "Pul 12 darslik paket uchun to'lanadi.",
  months: [
    {
      key: "2026-08",
      label: "Avgust",
      lessons: "12 ta",
      absent: null,
      cost: "200 000",
      costNote: null,
      money: "200 000",
      running: "0",
      runningTone: "muted",
      details: [],
      highlight: false,
      isLast: false,
    },
    {
      key: "2026-09",
      label: "Sentabr",
      lessons: "9 ta",
      absent: "2 kelmagan",
      cost: "150 000",
      costNote: null,
      money: "—",
      running: "−150 000",
      runningTone: "red",
      details: ["oylik to'lov: 9 dars × 16 667"],
      highlight: true,
      isLast: true,
    },
  ],
  sharpNote: [{ text: "Sentabr avgustdan 50 000 so'm kam.", bold: true }],
  modelChanges: [{ title: "Sentabrdan oylik to'lov", lines: ["Bir qator."] }],
  allocations: [
    {
      date: "25.09.2026",
      what: "Naqd",
      amount: "200 000",
      to: "avgust darslari 200 000",
      paymentId: "p1",
    },
  ],
  footnote: "Izoh matni.",
  warning: null,
  ...over,
});

const data = (v: StatementView = view()): StatementResponse => ({
  view: v,
  model: {
    asOf: "2026-09-26",
    months: [
      { key: "2026-08", lessonDays: [] },
      {
        key: "2026-09",
        lessonDays: [{ day: "2026-09-07", group: "#001", status: "kelmagan" }],
      },
    ],
    allocations: [
      {
        kind: "payment",
        paymentId: "p1",
        method: "CASH",
        amount: 200_000,
        at: "2026-09-25T12:00:00.000Z",
      },
    ],
  },
});

const render = (
  d: StatementResponse,
  who = { isCeo: false, canCorrect: true },
) =>
  renderToStaticMarkup(
    createElement(StatementReport, { data: d, who, now: NOW, onCorrect: () => {} }),
  );

describe("StatementReport", () => {
  it("renders the answer, the equation and every section from the view", () => {
    const html = render(data());
    for (const text of [
      "Qarzi: 150 000 so&#x27;m",
      "sentabr darslari uchun 150 000",
      "200 000",
      "Pul 12 darslik paket uchun to&#x27;lanadi.",
      "Oylar bo&#x27;yicha",
      "Sentabr",
      "2 kelmagan",
      "oylik to&#x27;lov: 9 dars × 16 667",
      "Sentabrdan oylik to&#x27;lov",
      "avgust darslari 200 000",
      "Izoh matni.",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/border-red-[^"]*"[^>]*>[\s\S]*Qarzi:/);
  });

  it("paints a credit answer green", () => {
    const html = render(
      data(
        view({
          answer: { tone: "credit", title: "Qarzi yo'q.", subtitle: "U oktabr to'loviga o'tadi." },
        }),
      ),
    );
    expect(html).toContain("border-emerald-");
    expect(html).not.toContain("border-red-300");
  });

  it("highlights the sharp-change month in yellow with its note", () => {
    const html = render(data());
    expect(html).toMatch(/bg-yellow-[^"]*"[^>]*data-month="2026-09"/);
    expect(html).toContain("Sentabr avgustdan 50 000 so&#x27;m kam.");
    expect(html).not.toMatch(/bg-yellow-[^"]*"[^>]*data-month="2026-08"/);
  });

  it("shows the admin warning only when the server sends one", () => {
    expect(render(data())).not.toContain('role="alert"');
    const html = render(data(view({ warning: "Farq bor. Dasturchiga xabar bering." })));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Farq bor. Dasturchiga xabar bering.");
  });

  it("keeps the receipt link on a payment row", () => {
    expect(render(data())).toContain("/receipts/payment/p1.pdf");
  });

  it("offers the correction menu only where the rule allows it", () => {
    expect(render(data())).toContain("Amallar");
    expect(render(data(), { isCeo: false, canCorrect: false })).not.toContain(
      "Amallar",
    );
  });
});

describe("LessonDayChips", () => {
  it("lists a month's lesson days with their status", () => {
    const html = renderToStaticMarkup(
      createElement(LessonDayChips, {
        days: [
          { day: "2026-09-07", group: "#001", status: "kelmagan" },
          { day: "2026-09-30", group: "#001", status: "kelgusi" },
        ],
        showGroup: false,
      }),
    );
    expect(html).toContain("07.09");
    expect(html).toContain("kelmagan");
    expect(html).toContain("hali o&#x27;tilmagan");
  });
});
