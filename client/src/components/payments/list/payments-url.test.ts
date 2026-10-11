import { describe, expect, it } from "vitest";
import {
  cleanPeriodId,
  hasPaymentFilter,
  legacyStudentPaymentsRedirect,
  listParams,
  moreFiltersCount,
  paymentsListHref,
  periodParams,
  periodRange,
  type PaymentFilters,
} from "./payments-url";

const base: PaymentFilters = {
  davr: "oy", dan: "", gacha: "", q: "", usul: "", nimaga: "", guruh: "", ustoz: "", kurs: "",
  qabul: "", manba: "", holat: "otgan", sahifa: 1, soni: 50, tolov: "",
};

describe("periodRange", () => {
  it("Bugun / Kecha", () => {
    expect(periodRange("bugun", "2026-10-11")).toEqual({ startDate: "2026-10-11", endDate: "2026-10-11" });
    expect(periodRange("kecha", "2026-10-01")).toEqual({ startDate: "2026-09-30", endDate: "2026-09-30" });
  });
  it("Bu hafta starts on Monday, also on a Sunday", () => {
    expect(periodRange("hafta", "2026-10-11")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-11" }); // Sunday
    expect(periodRange("hafta", "2026-10-05")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-11" }); // Monday
  });
  it("Bu oy runs to the month's last day; O'tgan oy in January", () => {
    expect(periodRange("oy", "2027-02-10")).toEqual({ startDate: "2027-02-01", endDate: "2027-02-28" });
    expect(periodRange("otgan-oy", "2027-01-15")).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
  });
  it("Oraliq: valid, reversed, empty, before the floor", () => {
    expect(periodRange("oraliq", "2026-10-11", "2026-09-01", "2026-09-30")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(periodRange("oraliq", "2026-10-11", "2026-09-30", "2026-09-01")).toBeNull();
    expect(periodRange("oraliq", "2026-10-11", "", "2026-09-01")).toBeNull();
    expect(periodRange("oraliq", "2026-10-11", "2026-04-01", "2026-05-10")).toEqual({ startDate: "2026-05-01", endDate: "2026-05-10" });
  });
  it("Oraliq: not a calendar day, or an end before the floor", () => {
    expect(periodRange("oraliq", "2026-10-11", "2026-02-30", "2026-09-01")).toBeNull();
    expect(periodRange("oraliq", "2026-10-11", "2026-09-01", "09.10.2026")).toBeNull();
    expect(periodRange("oraliq", "2026-10-11", "2026-03-01", "2026-04-30")).toBeNull();
  });
  it("an unknown davr is Bu oy", () => expect(periodRange("yil", "2026-10-11")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" }));
});

describe("cleanPeriodId", () => {
  it("keeps the six ids, anything else is oy", () => {
    expect(cleanPeriodId("otgan-oy")).toBe("otgan-oy");
    expect(cleanPeriodId("yil")).toBe("oy");
    expect(cleanPeriodId("")).toBe("oy");
  });
});

describe("legacyStudentPaymentsRedirect", () => {
  it("maps dates and the first of each list", () =>
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-09-01", endDate: "2026-09-30", groupIds: "g1,g2", teacherIds: "10003", methods: "CASH", courseId: "c1", branchId: "4", page: "2" }))
      .toBe("/payments/list?davr=oraliq&dan=2026-09-01&gacha=2026-09-30&guruh=g1&ustoz=10003&usul=CASH&kurs=c1"));
  it("takes the first of a repeated parameter", () =>
    expect(legacyStudentPaymentsRedirect({ groupIds: ["g2", "g3"], methods: ["CLICK,CASH"] })).toBe("/payments/list?guruh=g2&usul=CLICK"));
  it("clamps a start before the floor", () =>
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-04-01", endDate: "2026-06-30" })).toBe("/payments/list?davr=oraliq&dan=2026-05-01&gacha=2026-06-30"));
  it("drops the period when both are before the floor, reversed, or one is missing", () => {
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-03-01", endDate: "2026-04-30" })).toBe("/payments/list");
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-09-30", endDate: "2026-09-01" })).toBe("/payments/list");
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-09-01" })).toBe("/payments/list");
    expect(legacyStudentPaymentsRedirect({ startDate: "2026-02-31", endDate: "2026-09-01" })).toBe("/payments/list");
  });
});

describe("paymentsListHref", () => {
  it("current, previous and older months", () => {
    expect(paymentsListHref("2026-10", "2026-10")).toBe("/payments/list?davr=oy");
    expect(paymentsListHref("2026-09", "2026-10")).toBe("/payments/list?davr=otgan-oy");
    expect(paymentsListHref("2026-07", "2026-10")).toBe("/payments/list?davr=oraliq&dan=2026-07-01&gacha=2026-07-31");
    expect(paymentsListHref("2026-12", "2027-01")).toBe("/payments/list?davr=otgan-oy");
  });
});

describe("listParams", () => {
  it("translates the URL into the server's names", () => {
    const f = { ...base, q: " ism ", usul: "CLICK", nimaga: "qarz", guruh: "g1", ustoz: "10003", qabul: "onlayn", manba: "onlayn", holat: "hammasi", sahifa: 2, soni: 100 };
    expect(listParams(f, "2026-10-11")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", search: "ism", method: "CLICK", part: "LATE", groupId: "g1", teacherId: "10003", online: "true", source: "ONLINE", status: "ALL", page: 2, pageSize: 100 });
  });
  it("a numeric qabul is receivedById; holat otgan → COMPLETED; bad soni → 50", () => {
    const f = { ...base, qabul: "10002", manba: "admin", soni: 30 };
    expect(listParams(f, "2026-10-11")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", receivedById: "10002", source: "ADMIN", status: "COMPLETED", page: 1, pageSize: 50 });
  });
  it("kurs goes to courseId, bekor to REVERSED, junk values are dropped", () => {
    const f = { ...base, kurs: "c1", holat: "bekor", usul: "BITCOIN", nimaga: "x", manba: "y", ustoz: "abc", qabul: "abc", sahifa: 0 };
    expect(listParams(f, "2026-10-11")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", courseId: "c1", status: "REVERSED", page: 1, pageSize: 50 });
  });
  it("an unknown holat is COMPLETED; the search is cut at 100 characters", () => {
    const p = listParams({ ...base, holat: "x", q: "a".repeat(120) }, "2026-10-11");
    expect(p?.status).toBe("COMPLETED");
    expect(p?.search).toBe("a".repeat(100));
  });
  it("is null for an invalid Oraliq", () => expect(listParams({ ...base, davr: "oraliq", dan: "2026-09-30", gacha: "2026-09-01" }, "2026-10-11")).toBeNull());
});

describe("periodParams", () => {
  it("is the period alone", () => {
    expect(periodParams({ ...base, davr: "kecha" }, "2026-10-11")).toEqual({ startDate: "2026-10-10", endDate: "2026-10-10" });
    expect(periodParams({ ...base, davr: "oraliq" }, "2026-10-11")).toBeNull();
  });
});

describe("filter counters", () => {
  it("moreFiltersCount counts ustoz, kurs, qabul, manba and a holat other than otgan", () => {
    expect(moreFiltersCount(base)).toBe(0);
    expect(moreFiltersCount({ ...base, ustoz: "1", kurs: "c", qabul: "onlayn", manba: "admin", holat: "bekor" })).toBe(5);
    expect(moreFiltersCount({ ...base, holat: "nomalum" })).toBe(0);
  });
  it("hasPaymentFilter ignores the period, paging and the drawer", () => {
    expect(hasPaymentFilter({ ...base, davr: "bugun", sahifa: 3, soni: 100, tolov: "p1" })).toBe(false);
    expect(hasPaymentFilter({ ...base, q: "  " })).toBe(false);
    expect(hasPaymentFilter({ ...base, q: "ism" })).toBe(true);
    expect(hasPaymentFilter({ ...base, nimaga: "joriy" })).toBe(true);
    expect(hasPaymentFilter({ ...base, holat: "hammasi" })).toBe(true);
  });
});
