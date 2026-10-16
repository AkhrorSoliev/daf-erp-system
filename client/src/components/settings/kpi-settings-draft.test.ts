import { describe, expect, it } from "vitest";
import type { KpiSettings } from "@/components/reports/admin-kpi/kpi-types";
import { draftError, draftPatch, rangeHint, toDraft } from "./kpi-settings-draft";

const saved: KpiSettings = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: "FIXED", value: 50_000 },
  promiseKept: { mode: "PERCENT", value: 5 },
};

describe("toDraft", () => {
  it("keeps the numbers as strings so a cleared field stays cleared", () => {
    expect(toDraft(saved).leadPaid).toEqual({ mode: "FIXED", text: "50000" });
  });
});

describe("draftError", () => {
  it("asks for a value when the field is empty", () => {
    expect(draftError({ mode: "FIXED", text: "" })).toBe("Qiymatni kiriting");
  });
  it("reuses the shared rule check", () => {
    expect(draftError({ mode: "PERCENT", text: "101" })).toBe("Foiz 0 dan 100 gacha bo'ladi");
    expect(draftError({ mode: "PERCENT", text: "100" })).toBeNull();
    expect(draftError({ mode: "FIXED", text: "10000001" })).toBe("Summa 10 000 000 so'mdan oshmasin");
  });
});

describe("rangeHint", () => {
  it("names the allowed range of each mode", () => {
    expect(rangeHint("PERCENT")).toBe("0 dan 100 gacha, butun foiz");
    expect(rangeHint("FIXED")).toBe("0 dan 10 000 000 so'mgacha");
  });
});

describe("draftPatch", () => {
  it("is empty when nothing changed", () => {
    expect(draftPatch(saved, toDraft(saved))).toEqual({});
  });
  it("carries only the changed rule, parsed to a number", () => {
    const draft = { ...toDraft(saved), promiseKept: { mode: "PERCENT" as const, text: "7" } };
    expect(draftPatch(saved, draft)).toEqual({ promiseKept: { mode: "PERCENT", value: 7 } });
  });
  it("is empty while a field is invalid, so nothing half-typed is sent", () => {
    const draft = { ...toDraft(saved), leadPaid: { mode: "FIXED" as const, text: "" } };
    expect(draftPatch(saved, draft)).toEqual({});
  });
});
