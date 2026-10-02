import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatementReport } from "./statement-report";
import { LessonDayChips, MonthDetails } from "./statement-months-table";
import { StatementPayments } from "./statement-payments";
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
  dues: [
    {
      key: "2026-08",
      label: "Avgust",
      wide: false,
      bold: false,
      lessons: "12 ta",
      lessonsNote: null,
      cost: "200 000",
      costNote: null,
      paid: "200 000",
      left: "yo'q",
      leftTone: "green",
      details: [],
      highlight: false,
    },
    {
      key: "2026-09",
      label: "Sentabr",
      wide: false,
      bold: true,
      lessons: "9 ta",
      lessonsNote: "2 kelmagan",
      cost: "150 000",
      costNote: null,
      paid: "0",
      left: "150 000",
      leftTone: "red",
      details: ["oylik to'lov: 19-sentabrdan, 12 darsdan 9 tasi × 16 667"],
      highlight: true,
    },
  ],
  duesTotal: {
    cost: "350 000",
    paid: "200 000",
    left: "150 000",
    leftTone: "red",
    details: [],
  },
  surplus: null,
  sharpNote: [{ text: "Sentabr avgustdan 50 000 so'm kam.", bold: true }],
  payments: [
    {
      date: "25.09.2026",
      what: "Naqd",
      amount: "200 000",
      to: "avgust",
      paymentId: "p1",
    },
  ],
  paidTotal: "200 000",
  notes: ["Izoh matni."],
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

  it("lists the payments with their total and the month each went to", () => {
    const html = render(data());
    expect(html).toContain("Qaysi oyga yozildi");
    expect(html).toContain("Jami to&#x27;langan");
    expect(html).toContain("/receipts/payment/p1.pdf");
  });

  it("gives each month its price, what was paid and what is owed, with a total", () => {
    const html = render(data());
    for (const head of ["Narxi", "To&#x27;langan", "Qarz", "Jami"]) {
      expect(html).toContain(head);
    }
    expect(html).not.toContain("Oy oxirida");
    expect(html).toContain("2 kelmagan");
    expect(html).toContain("12 darsdan 9 tasi");
    expect(html).toMatch(/text-emerald-[^"]*"[^>]*>yo&#x27;q/);
    // The sharp note and the lesson days wait behind a click.
    expect(html).not.toContain("Sentabr avgustdan 50 000 so&#x27;m kam.");
    expect(html).toMatch(/data-month="2026-09"[^>]*class="[^"]*bg-yellow-|bg-yellow-[^"]*"[^>]*data-month="2026-09"/);
  });

  it("shows money ahead under the total", () => {
    const html = render(
      data(view({ surplus: { label: "Hisobida ortiqcha pul", amount: "+12 500" } })),
    );
    expect(html).toContain("Hisobida ortiqcha pul");
    expect(html).toContain("+12 500");
  });

  it("puts the notes and the raw ledger in closed sections under Batafsil", () => {
    const html = render(data());
    expect(html).toContain("Batafsil");
    expect(html).toContain("Izohlar");
    // Closed: its contents are not drawn yet.
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
  it("explains a sharp change, then lists the lesson days", () => {
    const html = renderToStaticMarkup(
      createElement(MonthDetails, {
        note: [{ text: "Sentabr avgustdan 50 000 so'm kam.", bold: true }],
        days: [
          { day: "2026-09-07", group: "#001", status: "kelmagan" },
          { day: "2026-09-30", group: "#001", status: "kelgusi" },
        ],
        showGroup: false,
      }),
    );
    expect(html).toContain("Sentabr avgustdan 50 000 so&#x27;m kam.");
    expect(html).toContain("07.09");
    expect(html).toContain("hali o&#x27;tilmagan");
  });
});

describe("StatementPayments", () => {
  const d = data();
  const renderRows = (canCorrect: boolean) =>
    renderToStaticMarkup(
      createElement(StatementPayments, {
        rows: d.view.payments,
        total: d.view.paidTotal,
        models: d.model.allocations,
        isCorrectable: () => canCorrect,
        onCorrect: () => {},
      }),
    );

  it("keeps the receipt link on a payment row", () => {
    expect(renderRows(true)).toContain("/receipts/payment/p1.pdf");
    expect(renderRows(true)).toContain("avgust");
  });

  it("offers the correction menu only where the rule allows it", () => {
    expect(renderRows(true)).toContain("Amallar");
    expect(renderRows(false)).not.toContain("Amallar");
  });

  it("says so when nothing was paid", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPayments, {
        rows: [],
        total: null,
        models: [],
        isCorrectable: () => false,
        onCorrect: () => {},
      }),
    );
    expect(html).toContain("Hali to&#x27;lov qilinmagan.");
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
