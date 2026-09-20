import { describe, expect, it } from "vitest";
import {
  biggestLossStage,
  buildFunnelRows,
  collapseSources,
  conversionPct,
  currentMonthRange,
  displayDate,
  FUNNEL_START_DATE,
  isPeopleStage,
  peopleQueryParams,
  presetRange,
  rangeIncludesToday,
  resolvePeriodFilter,
  resolveRange,
  visiblePresets,
  wholePercent,
} from "./lead-funnel-math";

describe("buildFunnelRows", () => {
  const rows = buildFunnelRows({
    lead: 213,
    enrolled: 44,
    attended: 37,
    paid: 25,
  });

  it("to'rt bosqichni tartib bilan qaytaradi", () => {
    expect(rows.map((r) => r.stage)).toEqual([
      "lead",
      "enrolled",
      "attended",
      "paid",
    ]);
  });

  it("birinchi bosqichga nisbatan foiz va kenglik", () => {
    expect(rows[0]).toMatchObject({
      pctOfFirst: 100,
      widthRatio: 1,
      lostFromPrev: null,
      pctOfPrev: null,
    });
    expect(rows[3].pctOfFirst).toBe(11.7);
    expect(rows[3].widthRatio).toBeCloseTo(25 / 213);
  });

  it("oldingi bosqichdan yo'qotish", () => {
    expect(rows[1].lostFromPrev).toBe(169);
    expect(rows[3].lostFromPrev).toBe(12);
    expect(rows[3].pctOfPrev).toBe(67.6);
  });

  it("lid 0 bo'lsa foiz null, kenglik 0 — nolga bo'linmaydi", () => {
    const empty = buildFunnelRows({
      lead: 0,
      enrolled: 0,
      attended: 0,
      paid: 0,
    });
    expect(
      empty.every((r) => r.pctOfFirst === null && r.widthRatio === 0),
    ).toBe(true);
  });
});

describe("currentMonthRange", () => {
  it("Toshkent oyini oladi, UTC oyini emas", () => {
    // 30.09 20:00 UTC = 01.10 01:00 Toshkent.
    expect(currentMonthRange(new Date("2026-09-30T20:00:00Z"))).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("voronka boshlangan oyda 10.09 dan boshlanadi", () => {
    expect(currentMonthRange(new Date("2026-09-13T10:00:00Z"))).toEqual({
      startDate: FUNNEL_START_DATE,
      endDate: "2026-09-30",
    });
  });

  it("kabisa yilidagi fevralning oxirgi kuni", () => {
    expect(currentMonthRange(new Date("2028-02-10T10:00:00Z")).endDate).toBe(
      "2028-02-29",
    );
  });
});

describe("resolveRange", () => {
  const now = new Date("2026-09-13T10:00:00Z");

  it("to'g'ri oraliqni qabul qiladi", () => {
    expect(resolveRange("2026-10-01", "2026-11-30", now)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-11-30",
      isDefault: false,
    });
  });

  it("10.09 dan oldingi boshlanishni shu kunga suradi", () => {
    expect(resolveRange("2026-06-01", "2026-09-30", now)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-30",
      isDefault: false,
    });
  });

  it.each([
    [null, null],
    ["2026-06-01", null],
    ["2026-09-30", "2026-06-01"],
    ["01.06.2026", "2026-09-30"],
    ["2026-08-01", "2026-08-31"],
  ])("buzilgan oraliq (%s, %s) joriy oyga qaytadi", (s, e) => {
    expect(resolveRange(s, e, now)).toMatchObject({
      startDate: "2026-09-10",
      isDefault: true,
    });
  });
});

describe("peopleQueryParams", () => {
  const range = { startDate: "2026-09-10", endDate: "2026-09-30", isDefault: true };

  it("faqat server biladigan maydonlarni yuboradi — isDefault yo'q", () => {
    expect(
      peopleQueryParams({ stage: "lead", mode: "all", page: 1, pageSize: 10, range }),
    ).toEqual({
      stage: "lead",
      mode: "all",
      page: 1,
      pageSize: 10,
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("unpaid uchun sana yubormaydi", () => {
    expect(
      peopleQueryParams({ stage: "unpaid", mode: "all", page: 2, pageSize: 20, range }),
    ).toEqual({ stage: "unpaid", mode: "all", page: 2, pageSize: 20 });
  });
});

describe("displayDate", () => {
  it("sana satrini siljitmaydi", () => {
    expect(displayDate("2026-09-01")).toBe("01.09.2026");
  });

  it("ISO vaqtni Toshkent kuniga o'giradi", () => {
    // 19:30 UTC = ertasi 00:30 Toshkent.
    expect(displayDate("2026-09-05T19:30:00.000Z")).toBe("06.09.2026");
  });
});

describe("izoh shartlari", () => {
  const now = new Date("2026-09-13T10:00:00Z");

  it("bugunni qamragan oraliq", () => {
    expect(
      rangeIncludesToday({ startDate: "2026-09-01", endDate: "2026-09-30" }, now),
    ).toBe(true);
    expect(
      rangeIncludesToday({ startDate: "2026-08-01", endDate: "2026-08-31" }, now),
    ).toBe(false);
  });

});

// 2026-09-20 15:00 Toshkent (UTC+5)
const SEP20 = new Date("2026-09-20T10:00:00Z");
const OCT15 = new Date("2026-10-15T10:00:00Z");

describe("presetRange", () => {
  it("shu oy — joriy Toshkent oyi, chegaraga qirqilgan", () => {
    expect(presetRange("shu-oy", SEP20)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("o'tgan oy sentyabrda yo'q (avgust chegaradan oldin)", () => {
    expect(presetRange("otgan-oy", SEP20)).toBeNull();
  });

  it("o'tgan oy oktyabrda 10.09 dan 30.09 gacha", () => {
    expect(presetRange("otgan-oy", OCT15)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("o'tgan oy yil boshida dekabrni oladi", () => {
    expect(presetRange("otgan-oy", new Date("2027-01-05T10:00:00Z"))).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
  });

  it("boshidan — chegaradan bugungacha", () => {
    expect(presetRange("boshidan", OCT15)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-10-15",
    });
  });
});

describe("visiblePresets", () => {
  it("sentyabrda o'tgan oy ko'rsatilmaydi", () => {
    expect(visiblePresets(SEP20)).toEqual(["shu-oy", "boshidan", "oraliq"]);
  });
  it("oktyabrdan to'rttasi ham", () => {
    expect(visiblePresets(OCT15)).toEqual(["shu-oy", "otgan-oy", "boshidan", "oraliq"]);
  });
});

describe("resolvePeriodFilter", () => {
  it("bo'sh URL — shu oy", () => {
    expect(resolvePeriodFilter({ period: "", startDate: "", endDate: "" }, SEP20)).toEqual({
      preset: "shu-oy",
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("oraliq to'g'ri sanalar bilan", () => {
    expect(
      resolvePeriodFilter(
        { period: "oraliq", startDate: "2026-09-12", endDate: "2026-09-15" },
        SEP20,
      ),
    ).toEqual({ preset: "oraliq", startDate: "2026-09-12", endDate: "2026-09-15" });
  });

  it("oraliq buzilgan sanalar bilan — shu oyga qaytadi", () => {
    expect(
      resolvePeriodFilter({ period: "oraliq", startDate: "2026-09-15", endDate: "2026-09-12" }, SEP20)
        .preset,
    ).toBe("shu-oy");
  });

  it("ko'rinmaydigan preset — shu oyga qaytadi", () => {
    expect(
      resolvePeriodFilter({ period: "otgan-oy", startDate: "", endDate: "" }, SEP20).preset,
    ).toBe("shu-oy");
    expect(
      resolvePeriodFilter({ period: "nimadir", startDate: "", endDate: "" }, SEP20).preset,
    ).toBe("shu-oy");
  });

  it("boshidan", () => {
    expect(
      resolvePeriodFilter({ period: "boshidan", startDate: "", endDate: "" }, OCT15),
    ).toEqual({ preset: "boshidan", startDate: "2026-09-10", endDate: "2026-10-15" });
  });
});

describe("yo'qotish", () => {
  const rows = buildFunnelRows({ lead: 146, enrolled: 55, attended: 47, paid: 13 });

  it("yo'qotish foizi — o'tmaganlar ulushi, butun son", () => {
    expect(rows.map((r) => r.lostPct)).toEqual([null, 62, 15, 72]);
  });

  it("eng katta yo'qotish kishi soni bo'yicha", () => {
    expect(biggestLossStage(rows)).toBe("enrolled");
  });

  it("yo'qotish bo'lmasa null", () => {
    expect(
      biggestLossStage(buildFunnelRows({ lead: 3, enrolled: 3, attended: 3, paid: 3 })),
    ).toBeNull();
    expect(biggestLossStage([])).toBeNull();
  });
});

describe("conversionPct / wholePercent", () => {
  it("butun foiz, nolga bo'linmaydi", () => {
    expect(conversionPct(146, 13)).toBe(9);
    expect(conversionPct(0, 0)).toBeNull();
  });
  it("wholePercent kasrsiz", () => {
    expect(wholePercent(8.9)).toBe("9%");
    expect(wholePercent(null)).toBe("—");
  });
});

describe("collapseSources", () => {
  const row = (id: string, lead: number) => ({
    id,
    name: id,
    lead,
    enrolled: 0,
    attended: 0,
    paid: lead > 5 ? 1 : 0,
  });

  it("5 tagacha o'zgarmaydi, kalit id yoki 'none'", () => {
    const out = collapseSources([row("a", 9), { ...row("b", 1), id: null, name: null }]);
    expect(out.map((r) => [r.key, r.isRest])).toEqual([
      ["a", false],
      ["none", false],
    ]);
  });

  it("6 tadan boshlab qolgani «Boshqalar» ga yig'iladi", () => {
    const out = collapseSources([
      row("a", 9), row("b", 8), row("c", 7), row("d", 6), row("e", 5), row("f", 2), row("g", 1),
    ]);
    expect(out).toHaveLength(6);
    expect(out[5]).toMatchObject({
      key: "rest",
      isRest: true,
      name: "Boshqalar (2 ta manba)",
      lead: 3,
      paid: 0,
    });
  });

  it("6 nomlangan manba + manbasiz qator: manbasiz hech qachon Boshqalar'ga qo'shilmaydi", () => {
    const residual = { ...row("z", 4), id: null, name: null, enrolled: 2, attended: 1 };
    // Manbasiz qator kiritishda ataylab OXIRIDA emas — server har doim oxiriga
    // qo'yadi, lekin funksiya pozitsiyaga emas, id'ga qarab topishi kerak.
    const out = collapseSources([
      row("a", 9),
      row("b", 8),
      row("c", 7),
      residual,
      row("d", 6),
      row("e", 5),
      row("f", 2),
    ]);
    expect(out).toHaveLength(7);
    expect(out.slice(0, 5).map((r) => r.key)).toEqual(["a", "b", "c", "d", "e"]);
    expect(out[5]).toMatchObject({
      key: "rest",
      isRest: true,
      name: "Boshqalar (1 ta manba)",
      lead: 2,
      enrolled: 0,
      attended: 0,
      paid: 0,
    });
    expect(out[6]).toMatchObject({
      key: "none",
      isRest: false,
      lead: 4,
      enrolled: 2,
      attended: 1,
      paid: 0,
    });
  });

  it("aniq 5 ta nomlangan manba, manbasiz qator yo'q — hech narsa yig'ilmaydi", () => {
    const out = collapseSources([
      row("a", 9), row("b", 8), row("c", 7), row("d", 6), row("e", 5),
    ]);
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.key)).toEqual(["a", "b", "c", "d", "e"]);
    expect(out.every((r) => !r.isRest)).toBe(true);
  });

  it("6 ta nomlangan manba, manbasiz qator yo'q — beshtadan keyin Boshqalar", () => {
    const out = collapseSources([
      row("a", 9), row("b", 8), row("c", 7), row("d", 6), row("e", 5), row("f", 2),
    ]);
    expect(out).toHaveLength(6);
    expect(out[5]).toMatchObject({
      key: "rest",
      isRest: true,
      name: "Boshqalar (1 ta manba)",
      lead: 2,
      paid: 0,
    });
  });
});

describe("peopleQueryParams — manba va holat", () => {
  it("manba faqat bosqichlarda, holat faqat unpaid da yuboriladi", () => {
    const range = { startDate: "2026-09-10", endDate: "2026-09-30" };
    expect(
      peopleQueryParams({ stage: "lead", mode: "all", page: 1, pageSize: 10, range, sourceId: "none", status: "active" }),
    ).toEqual({ stage: "lead", mode: "all", page: 1, pageSize: 10, startDate: "2026-09-10", endDate: "2026-09-30", sourceId: "none" });
    expect(
      peopleQueryParams({ stage: "unpaid", mode: "all", page: 1, pageSize: 10, range, sourceId: "x", status: "frozen" }),
    ).toEqual({ stage: "unpaid", mode: "all", page: 1, pageSize: 10, status: "frozen" });
  });
});

describe("isPeopleStage", () => {
  it("faqat ma'lum bosqichlar", () => {
    expect(isPeopleStage("unpaid")).toBe(true);
    expect(isPeopleStage("lead")).toBe(true);
    expect(isPeopleStage("x")).toBe(false);
    expect(isPeopleStage("")).toBe(false);
  });
});
