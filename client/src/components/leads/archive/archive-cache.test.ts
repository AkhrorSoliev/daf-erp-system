import { describe, expect, it } from "vitest";
import { minusCounts, withoutRow, type Paged } from "./archive-cache";

const page: Paged<{ id: string }> = {
  data: [{ id: "a" }, { id: "b" }],
  total: 12,
  page: 1,
  pageSize: 10,
};

describe("withoutRow", () => {
  it("drops the row and one from the total", () => {
    expect(withoutRow(page, "a")).toEqual({
      data: [{ id: "b" }],
      total: 11,
      page: 1,
      pageSize: 10,
    });
  });
  it("leaves a page without that row alone", () => {
    expect(withoutRow(page, "zzz")).toBe(page);
    expect(withoutRow(undefined, "a")).toBeUndefined();
  });
});

describe("minusCounts", () => {
  const summary = { leads: 5, sections: 2, archivers: [] };
  it("subtracts and never goes below zero", () => {
    expect(minusCounts(summary, { leads: 1 })).toEqual({ ...summary, leads: 4 });
    expect(minusCounts(summary, { sections: 1, leads: 9 })).toEqual({
      ...summary,
      sections: 1,
      leads: 0,
    });
  });
  it("passes an unloaded summary through", () => {
    expect(minusCounts(undefined, { leads: 1 })).toBeUndefined();
  });
});
