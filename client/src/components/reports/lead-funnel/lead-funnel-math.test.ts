import { describe, expect, it } from "vitest";
import {
  buildFunnelRows,
  currentMonthRange,
  displayDate,
  FUNNEL_START_DATE,
  peopleQueryParams,
  rangeIncludesToday,
  resolveRange,
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
