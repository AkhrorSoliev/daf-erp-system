import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { SalaryAttentionCard } from "./salary-attention-card";
import { mergePeople } from "./salary-page-model";
import { SalaryPeopleTable } from "./salary-people-table";
import { SalarySummaryCard } from "./salary-summary-card";
import { response, state, teacher } from "./salary-fixture";
import type { MonthlyResponse } from "./salary-types";

// Static markup in the node environment (no DOM), as statement-report.test.ts.
// React escapes the apostrophe; the assertions read the text as shown.
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replaceAll("&#x27;", "'").replaceAll("&quot;", '"');

const noop = () => {};

describe("SalarySummaryCard", () => {
  const summary = (data: MonthlyResponse, canClose = true, unpaidCount = 2) =>
    html(createElement(SalarySummaryCard, { data, canClose, unpaidCount, onSettle: noop }));

  it("titles the month, shows the state pill and the three figures", () => {
    const out = summary(response());
    expect(out).toContain("Sentabr oyliklari");
    expect(out).toContain("Hisoblandi · tasdiqlash kutilmoqda");
    expect(out).toContain("Ishladi");
    expect(out).toContain("10,5 mln");
    expect(out).toContain("ustozlar 7,5 mln · xodimlar 3 mln");
    expect(out).toContain("Avans (oylikdan ushlanadi)");
    expect(out).toContain("2 ta");
    expect(out).toContain("Beriladi");
    expect(out).toContain("9,7 mln");
    expect(out).toContain("2 ustoz · 1 xodim");
    expect(out).not.toContain("Oy oxirida beriladi");
  });

  it("an open month is paid at its end", () => {
    expect(summary(response({ monthState: state("OPEN") }))).toContain("Oy oxirida beriladi");
  });

  it("says how much the center put in, with the month the students owe for", () => {
    const out = summary(response());
    expect(out).toContain("shundan ");
    expect(out).toContain("markaz qo'shdi");
    expect(out).toContain("1,5 mln");
    expect(out).toContain("o'quvchilar sentabr to'lovini hali to'lamagan; to'lagan sari kamayadi");
  });

  it("always carries the green line that the other screens show the same numbers", () => {
    expect(summary(response())).toContain(
      "Umumiy ma'lumotlardagi «Oyliklar» kartasi va ustozning «Mening oyligim» sahifasi — shu raqamlar",
    );
  });

  it("offers the bulk settle only to the CEO, for a calculated month with unpaid rows", () => {
    expect(summary(response())).toContain("Oylik berilganini tasdiqlash (2 ta)");
    expect(summary(response())).toContain("Hammasi bir kunda berilgan bo'lsa — bir yo'la belgilash.");
    expect(summary(response(), false)).not.toContain("Oylik berilganini tasdiqlash");
    expect(summary(response(), true, 0)).not.toContain("Oylik berilganini tasdiqlash");
    expect(summary(response({ monthState: state("OPEN") }))).not.toContain("Oylik berilganini tasdiqlash");
  });

  it("a month without lesson data has no teachers' figure: «—» and «o'tish oyi»", () => {
    const manual = response({
      data: [teacher({ id: 10001, firstName: "Madina", hasLessonData: false, fullDeserved: null })],
    });
    const out = summary(manual);
    expect(out).toContain("ustozlar — · xodimlar 3 mln");
    expect(out).toContain("o'tish oyi");
    expect(out).not.toContain("markaz qo'shdi");
  });
});

describe("SalaryAttentionCard", () => {
  const attention: MonthlyResponse["attention"] = {
    lessonsWithoutRate: [{ userId: 10004, firstName: "Bobur", lastName: "Toshmatov", units: 6 }],
    staffWithoutRate: [
      { userId: 10005, firstName: "Aziz", lastName: "Qodirov" },
      { userId: 10006, firstName: "Laylo", lastName: "Nazarova" },
    ],
  };
  const card = (a: MonthlyResponse["attention"], canEditStaffRates: boolean) =>
    html(createElement(SalaryAttentionCard, { attention: a, canEditStaffRates, onOpenSettings: noop }));

  it("names every teacher whose lessons have no rate, with a button", () => {
    const out = card(attention, true);
    expect(out).toContain("E'tibor talab qiladi");
    expect(out).toContain("6 ta darsga ustoz haqi yozilmagan");
    expect(out).toContain("Bobur Toshmatov uchun stavka qo'yilmagan.");
    expect(out).toContain("Stavka qo'yish");
  });

  it("lists the staff without a salary only to a viewer who can set staff rates", () => {
    expect(card(attention, true)).toContain("2 xodimning oyligi hisoblanmaydi");
    expect(card(attention, true)).toContain("Aziz Qodirov, Laylo Nazarova uchun oylik summa kiritilmagan.");
    expect(card(attention, false)).not.toContain("xodimning oyligi hisoblanmaydi");
  });

  it("is not drawn without a row to show", () => {
    expect(card({ lessonsWithoutRate: [], staffWithoutRate: [] }, true)).toBe("");
    expect(card({ lessonsWithoutRate: [], staffWithoutRate: attention.staffWithoutRate }, false)).toBe("");
  });
});

describe("SalaryPeopleTable", () => {
  const table = (data: MonthlyResponse, loading = false) =>
    html(
      createElement(SalaryPeopleTable, {
        rows: mergePeople(data),
        state: data.monthState.kind,
        loading,
        onOpenRow: noop,
      }),
    );

  it("has the six columns after «#», in order", () => {
    const out = table(response());
    const heads = ["#", "Xodim", "Nimadan", "Ishladi", "Avans", "Beriladi", "Holat"].map((h) =>
      out.indexOf(`>${h}</th>`),
    );
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
  });

  it("lists teachers before staff, with the paid day and the totals", () => {
    const out = table(response());
    expect(out.indexOf("Madina Karimova")).toBeLessThan(out.indexOf("Dilnoza Rahimova"));
    expect(out).toContain("4 guruh · 38 o'quvchi");
    expect(out).toContain("qat'iy oylik");
    expect(out).toContain("berildi 05.10");
    expect(out).toContain("Jami · 3 kishi");
    expect(out).toContain(formatPrice(10_500_000));
    expect(out).toContain(formatPrice(9_700_000));
  });

  it("shows skeleton rows while loading and the empty text when no one is found", () => {
    const loading = table(response(), true);
    expect(loading).toContain('data-slot="skeleton"');
    expect(loading).not.toContain("Jami ·");
    expect(table(response({ data: [], staff: [] }))).toContain(
      "Bu oyda hech kim topilmadi — oyni yoki qidiruvni o'zgartirib ko'ring.",
    );
  });
});
