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
    { source: "Instagram", leads: 40, students: 10 },
    { source: null, leads: 5, students: 1 },
  ],
};

const render = (data: MarketingReport) => norm(renderToStaticMarkup(createElement(MarketingReportView, { data })));

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

  it("lists the months with «13×» and «3,4×», a transition month muted with «*» and «—»", () => {
    const text = render(REPORT);

    expect(text).toContain(`Oktabr 2026 ${money(5_800_000)} ${num(171)} ${money(33_918)} ${money(75_400_000)} 13×`);
    expect(text).toContain(`Sentabr 2026 ${money(4_000_000)} ${num(120)} ${money(33_333)} ${money(13_600_000)} ${oneDecimal(3.4)}×`);
    expect(text).toContain(`Iyun 2026 ${money(1_000_000)} ${num(260)}* — — —`);
    expect(text).toContain("* May–iyun — tizimga o'tish oylari");
  });

  it("lists the lead sources with their conversion, «Manba yozilmagan» for none", () => {
    const text = render(REPORT);

    expect(text).toContain("Manba bo'yicha (lid manbasi yozilganlar)");
    expect(text).toContain("Instagram 40 10 25%");
    expect(text).toContain("Manba yozilmagan 5 1 20%");
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
  });

  it("a month before lead sources shows only the footnote; missing figures are «—»", () => {
    const text = render({ ...REPORT, cac: null, ltv: null, sources: null });

    expect(text).not.toContain("Manba yozilmagan");
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
    expect(text).toContain("Jalb qilish narxi — sarf");
    expect(text).toContain("O'quvchi qiymati — o'rtacha — oy × oyiga —");
  });

  it("prints no English abbreviation", () => {
    expect(render(REPORT)).not.toMatch(/\b(LTV|CAC|ROI)\b/);
  });
});
