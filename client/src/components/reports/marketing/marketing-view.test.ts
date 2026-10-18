import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MarketingMonth, MarketingReport } from "./marketing-format";
import { MarketingReportView } from "./marketing-view";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);
const oneDecimal = (n: number) => norm(n.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

const OCTOBER: MarketingMonth = { month: "2026-10", spend: 5_800_000, newStudents: 171, cac: 33_918, cohortPaid: 75_400_000, roi: 13, transition: false };
const SEPTEMBER: MarketingMonth = { month: "2026-09", spend: 4_000_000, newStudents: 120, cac: 33_333, cohortPaid: 13_600_000, roi: 3.4, transition: false };
const JUNE: MarketingMonth = { month: "2026-06", spend: 1_000_000, newStudents: 260, cac: null, cohortPaid: null, roi: null, transition: true };

const REPORT: MarketingReport = {
  ...OCTOBER,
  ltv: { value: 1_258_000, avgMonths: 3.4, monthlyCharge: 370_000 },
  months: [OCTOBER, SEPTEMBER, JUNE],
  sources: [
    { source: "Instagram", spend: 4_000_000, leads: 40, students: 10, rate: 25, cac: 400_000, paid: 12_000_000, roi: 3 },
    { source: "Tavsiya", spend: 0, leads: 8, students: 2, rate: 25, cac: null, paid: 800_000, roi: null },
    { source: null, spend: 0, leads: 3, students: 1, rate: 33.3, cac: null, paid: 300_000, roi: null },
  ],
  sourcesTotal: { spend: 5_800_000, leads: 51, students: 13, rate: 25.5, cac: 446_154, paid: 13_100_000, roi: 2.26 },
  unassignedSpend: 1_800_000,
};

const markup = (data: MarketingReport) => renderToStaticMarkup(createElement(MarketingReportView, { data }));
const render = (data: MarketingReport) => norm(markup(data));

describe("MarketingReportView", () => {
  it("shows the four cards with their sub-lines", () => {
    const text = render(REPORT);

    expect(text).toContain(`Marketingga sarflandi ${money(5_800_000)} Xarajatlar → Marketing`);
    expect(text).toContain(`Yangi o'quvchilar ${num(171)} birinchi marta to'laganlar`);
    expect(text).toContain(`Jalb qilish narxi ${money(33_918)} sarf ÷ yangi o'quvchilar`);
    expect(text).toContain(`O'quvchi qiymati ${money(1_258_000)} o'rtacha ${oneDecimal(3.4)} oy × oyiga ${money(370_000)}`);
  });

  it("says what the spend brought, with the upper-bound warning", () => {
    const text = render(REPORT);

    expect(text).toContain(
      `Marketing samarasi Oktabrda qo'shilgan 171 o'quvchi hozirgacha ${money(75_400_000)} to'ladi — marketingga sarflangan ${money(5_800_000)} dan 13 barobar ko'p.`,
    );
    expect(text).toContain("Bu yuqori chegara: hamma yangi o'quvchi ham reklamadan kelmagan.");
  });

  it("has no upper-bound warning when there is no figure to bound", () => {
    expect(render({ ...REPORT, roi: null })).not.toContain("Bu yuqori chegara");
  });

  it("lists the months with «13×» and «3,4×», a transition month muted with «*» and «—»", () => {
    const text = render(REPORT);

    expect(text).toContain(`Oktabr 2026 ${money(5_800_000)} ${num(171)} ${money(33_918)} ${money(75_400_000)} 13×`);
    expect(text).toContain(`Sentabr 2026 ${money(4_000_000)} ${num(120)} ${money(33_333)} ${money(13_600_000)} ${oneDecimal(3.4)}×`);
    expect(text).toContain(`Iyun 2026 ${money(1_000_000)} ${num(260)}* — — —`);
    expect(text).toContain("* May–iyun — tizimga o'tish oylari");
  });

  it("lists each channel with its spend, cost of one student, money and return, «—» where it cost nothing", () => {
    const text = render(REPORT);

    expect(text).toContain("Kanallar bo'yicha");
    expect(text).toContain(
      `Instagram ${money(4_000_000)} 40 10 ${money(400_000)} ${money(12_000_000)} ${oneDecimal(3)}× 25%`,
    );
    // Nothing was spent on it: no cost of one student and no return, but its money counts.
    expect(text).toContain(`Tavsiya — 8 2 — ${money(800_000)} — 25%`);
    // The server's one-decimal rate, printed as sent (the client divides nothing).
    expect(text).toContain(`Manba yozilmagan — 3 1 — ${money(300_000)} — ${oneDecimal(33.3)}%`);
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
  });

  it("closes the channel table with «Hammasi» and names the spend that names no channel", () => {
    const text = render(REPORT);

    expect(text).toContain(`Hammasi ${money(5_800_000)} 51 13 ${money(446_154)} ${money(13_100_000)} ${oneDecimal(2.26)}× ${oneDecimal(25.5)}%`);
    expect(text).toContain(`Kanali ko'rsatilmagan sarf: ${money(1_800_000)}`);
    expect(render({ ...REPORT, unassignedSpend: 0 })).not.toContain("Kanali ko'rsatilmagan sarf");
  });

  it("puts the channel table above the overall figures", () => {
    const text = render(REPORT);

    expect(text.indexOf("Kanallar bo'yicha")).toBeLessThan(text.indexOf("Jami (hamma kanal birga)"));
    expect(text.indexOf("Jami (hamma kanal birga)")).toBeLessThan(text.indexOf("Marketingga sarflandi"));
  });

  it("a month before lead sources shows only the footnote; missing figures are «—»", () => {
    const text = render({ ...REPORT, cac: null, ltv: null, sources: null, sourcesTotal: null, unassignedSpend: null });

    expect(text).not.toContain("Manba yozilmagan");
    expect(text).not.toContain("Hammasi");
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
    expect(text).toContain("Jalb qilish narxi — sarf");
    expect(text).toContain("O'quvchi qiymati — o'rtacha — oy × oyiga —");
  });

  it("prints no English abbreviation", () => {
    expect(render(REPORT)).not.toMatch(/\b(LTV|CAC|ROI)\b/);
  });
});
