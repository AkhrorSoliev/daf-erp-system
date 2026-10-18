import { describe, expect, it } from "vitest";
import { initialPlace, originOf, type RestoreColumn } from "./restore-lead-model";

const columns: RestoreColumn[] = [
  { id: "c1", name: "Yangi Lidlar", sections: [{ id: "s1", name: "Reklama" }] },
];
const origin = { columnId: "c1", sectionId: "s1", label: "Yangi Lidlar · Reklama" };

describe("originOf", () => {
  it("labels the lead's old place", () => {
    expect(
      originOf({
        section: { id: "s1", name: "Reklama", column: { id: "c1", name: "Yangi Lidlar" } },
      }),
    ).toEqual(origin);
  });
  it("has none for a lead without a section or column", () => {
    expect(originOf({ section: null })).toBeNull();
    expect(originOf({ section: { id: "s", name: "x", column: null } })).toBeNull();
  });
});

describe("initialPlace", () => {
  it("preselects the old place when it is still on the board", () => {
    expect(initialPlace(origin, columns, true)).toEqual({
      columnId: "c1",
      sectionId: "s1",
      missingLabel: null,
    });
  });
  it("asks for a new place and names the old one when it is gone", () => {
    expect(initialPlace({ ...origin, sectionId: "gone" }, columns, true)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: "Yangi Lidlar · Reklama",
    });
  });
  it("says nothing while the board is still loading", () => {
    expect(initialPlace(origin, [], false)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: null,
    });
  });
  it("starts empty without an origin (the forms page)", () => {
    expect(initialPlace(null, columns, true)).toEqual({
      columnId: "",
      sectionId: "",
      missingLabel: null,
    });
  });
});
