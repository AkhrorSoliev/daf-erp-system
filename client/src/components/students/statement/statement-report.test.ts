import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatementReport } from "./statement-report";
import { LessonDayChips, MonthDetails } from "./statement-months-table";
import { StatementAllocations } from "./statement-allocations";
import { StatementSummary } from "./statement-summary";
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
    equation: {
      paid: 200_000,
      items: [],
      lessons: 350_000,
      prepaidAhead: 0,
      balance: -150_000,
    },
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

const render = (d: StatementResponse) =>
  renderToStaticMarkup(
    createElement(StatementReport, {
      data: d,
      who: { isCeo: false, canCorrect: true },
      now: NOW,
      onCorrect: () => {},
    }),
  );

describe("StatementReport", () => {
  it("leads with the answer and the numbers that make it", () => {
    const html = render(data());
    expect(html).toContain("Qarzi: 150 000 so&#x27;m");
    expect(html).toContain("sentabr darslari uchun 150 000");
    for (const label of ["To&#x27;lagan", "Darslar narxi", "Qoldiq"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/border-red-[^"]*"[^>]*>[\s\S]*Qarzi:/);
  });

  it("keeps each month to one line, its notes wait behind a click", () => {
    const html = render(data());
    expect(html).toContain("Sentabr");
    expect(html).toContain("2 kelmagan");
    expect(html).not.toContain("oylik to&#x27;lov: 9 dars");
    expect(html).not.toContain("Sentabr avgustdan 50 000 so&#x27;m kam.");
    expect(html).toMatch(/bg-yellow-[^"]*"[^>]*data-month="2026-09"/);
    expect(html).not.toMatch(/bg-yellow-[^"]*"[^>]*data-month="2026-08"/);
  });

  it("puts the rest in closed sections under Batafsil", () => {
    const html = render(data());
    expect(html).toContain("Batafsil");
    expect(html).toContain("To&#x27;lovlar qayerga ketdi");
    expect(html).toContain("To&#x27;lov turi o&#x27;zgarishi");
    expect(html).toContain("Hisob qanday chiqdi");
    // Closed: their contents are not drawn yet.
    expect(html).not.toContain("avgust darslari 200 000");
    expect(html).not.toContain("Izoh matni.");
  });

  it("shows the admin warning only when the server sends one", () => {
    expect(render(data())).not.toContain('role="alert"');
    const html = render(
      data(view({ warning: "Farq bor. Dasturchiga xabar bering." })),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Farq bor. Dasturchiga xabar bering.");
  });
});

describe("StatementSummary", () => {
  const equation = data().model.equation;

  it("paints a credit answer green", () => {
    const html = renderToStaticMarkup(
      createElement(StatementSummary, {
        answer: {
          tone: "credit",
          title: "Qarzi yo'q.",
          subtitle: "U oktabr to'loviga o'tadi.",
        },
        equation,
      }),
    );
    expect(html).toContain("border-emerald-");
    expect(html).not.toContain("border-red-300");
  });

  it("adds an 'other' tile only when something besides payments and lessons moved the balance", () => {
    const answer = view().answer;
    const plain = renderToStaticMarkup(
      createElement(StatementSummary, { answer, equation }),
    );
    expect(plain).not.toContain("Boshqa");
    const withRefund = renderToStaticMarkup(
      createElement(StatementSummary, {
        answer,
        equation: {
          ...equation,
          items: [{ kind: "refund", amount: -50_000 }],
          balance: -200_000,
        },
      }),
    );
    expect(withRefund).toContain("Boshqa");
    expect(withRefund).toContain("-50");
  });
});

describe("MonthDetails", () => {
  it("explains the month, then lists its lesson days", () => {
    const html = renderToStaticMarkup(
      createElement(MonthDetails, {
        details: ["oylik to'lov: 9 dars × 16 667"],
        note: [{ text: "Sentabr avgustdan 50 000 so'm kam.", bold: true }],
        days: [
          { day: "2026-09-07", group: "#001", status: "kelmagan" },
          { day: "2026-09-30", group: "#001", status: "kelgusi" },
        ],
        showGroup: false,
      }),
    );
    expect(html).toContain("oylik to&#x27;lov: 9 dars × 16 667");
    expect(html).toContain("Sentabr avgustdan 50 000 so&#x27;m kam.");
    expect(html).toContain("07.09");
    expect(html).toContain("hali o&#x27;tilmagan");
  });
});

describe("StatementAllocations", () => {
  const d = data();
  const renderRows = (canCorrect: boolean) =>
    renderToStaticMarkup(
      createElement(StatementAllocations, {
        rows: d.view.allocations,
        models: d.model.allocations,
        isCorrectable: () => canCorrect,
        onCorrect: () => {},
      }),
    );

  it("keeps the receipt link on a payment row", () => {
    expect(renderRows(true)).toContain("/receipts/payment/p1.pdf");
    expect(renderRows(true)).toContain("avgust darslari 200 000");
  });

  it("offers the correction menu only where the rule allows it", () => {
    expect(renderRows(true)).toContain("Amallar");
    expect(renderRows(false)).not.toContain("Amallar");
  });
});

describe("LessonDayChips", () => {
  it("lists a month's lesson days with their status", () => {
    const html = renderToStaticMarkup(
      createElement(LessonDayChips, {
        days: [{ day: "2026-09-07", group: "#001", status: "kelmagan" }],
        showGroup: false,
      }),
    );
    expect(html).toContain("07.09");
    expect(html).toContain("kelmagan");
  });
});
