import { describe, expect, it } from "vitest";
import {
  buildFunnelRows,
  currentMonthRange,
  displayDate,
  rangeIncludesToday,
  rangeStartsBeforeDirectLeads,
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
    // 31.08 20:00 UTC = 01.09 01:00 Toshkent.
    expect(currentMonthRange(new Date("2026-08-31T20:00:00Z"))).toEqual({
      startDate: "2026-09-01",
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
    expect(resolveRange("2026-06-01", "2026-09-30", now)).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      isDefault: false,
    });
  });

  it.each([
    [null, null],
    ["2026-06-01", null],
    ["2026-09-30", "2026-06-01"],
    ["01.06.2026", "2026-09-30"],
  ])("buzilgan oraliq (%s, %s) joriy oyga qaytadi", (s, e) => {
    expect(resolveRange(s, e, now)).toMatchObject({
      startDate: "2026-09-01",
      isDefault: true,
    });
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

  it("10.09 dan oldingi boshlanish", () => {
    expect(rangeStartsBeforeDirectLeads({ startDate: "2026-09-01" })).toBe(
      true,
    );
    expect(rangeStartsBeforeDirectLeads({ startDate: "2026-09-10" })).toBe(
      false,
    );
  });
});
