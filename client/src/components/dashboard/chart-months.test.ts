import { describe, expect, it } from "vitest";
import { chartMonthLabel } from "./chart-months";

const identity = (s: string) => s;
const NAMES = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

/** A `t` that marks what it translated and remembers every call. */
function spy() {
  const calls: string[] = [];
  const t = (s: string) => {
    calls.push(s);
    return `<${s.toUpperCase()}>`;
  };
  return { t, calls };
}

describe("chartMonthLabel", () => {
  it("leaves the label as it is with an identity t", () => {
    for (const label of ["Okt", "5 Apr", "Yan 2026", "Hafta 3", ""]) {
      expect(chartMonthLabel(label, identity)).toBe(label);
    }
  });

  it("sends a month name through t", () => {
    const { t, calls } = spy();
    expect(chartMonthLabel("Okt", t)).toBe("<OKT>");
    expect(calls).toEqual(["Okt"]);
  });

  it("translates only the month word of a week label and keeps the day", () => {
    const { t, calls } = spy();
    expect(chartMonthLabel("5 Apr", t)).toBe("5 <APR>");
    expect(calls).toEqual(["Apr"]);
  });

  it("keeps the year of a month label", () => {
    const { t } = spy();
    expect(chartMonthLabel("Yan 2026", t)).toBe("<YAN> 2026");
  });

  it("maps all 12 names", () => {
    const { t, calls } = spy();
    for (const name of NAMES) expect(chartMonthLabel(name, t)).toBe(`<${name.toUpperCase()}>`);
    expect(calls).toEqual(NAMES);
  });

  it("passes an unknown label and an empty string through without calling t", () => {
    const { t, calls } = spy();
    expect(chartMonthLabel("Hafta 3", t)).toBe("Hafta 3");
    expect(chartMonthLabel("", t)).toBe("");
    expect(calls).toEqual([]);
  });
});
