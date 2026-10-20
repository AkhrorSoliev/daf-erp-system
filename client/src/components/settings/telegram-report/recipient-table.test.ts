import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Recipient } from "./telegram-report-api";
import { RecipientTable } from "./recipient-table";

const base: Recipient = {
  id: 1, userId: 50, name: "Ali Valiyev", position: "Administrator", sendTime: "21:00",
  layout: "BY_SECTION", allBranches: false, branchIds: [1], sections: ["STUDENTS"], isActive: true,
  lastSentDate: null, telegramLinked: true, noBranch: false, reach: "DELIVERED", blockedAt: null,
  lastAttempt: { at: "2026-10-17T11:00:00Z", ok: true, note: null },
};
const branches = [{ id: 1, name: "Farg'ona" }];
const html = (rows: Recipient[], extra: Partial<Parameters<typeof RecipientTable>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(RecipientTable, {
      rows, branches, selectedId: 1, now: new Date("2026-10-17T12:00:00Z"),
      onSelect: () => {}, onToggle: () => {}, busy: false, empty: "Hali oluvchi yo'q", ...extra,
    }),
  );

describe("RecipientTable", () => {
  it("prints name, position and branch, the reach pill and the note", () => {
    const out = html([base]);
    expect(out).toContain("Ali Valiyev");
    expect(out).toContain("Administrator");
    expect(out).toContain("Farg&#x27;ona");
    expect(out).toContain("Yetadi");
    expect(out).toContain("oxirgi: bugun 16:00");
    expect(out).toContain("21:00");
  });

  it("marks the selected row and shows the problem pills", () => {
    const out = html([base, { ...base, id: 2, name: "Dilnoza", reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z" }]);
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain("Yetib bormaydi");
    expect(out).toContain("botni bloklagan");
  });

  it("disables the switch while a save is pending", () => {
    expect(html([base], { busy: true })).toContain('disabled=""');
    expect(html([base], { busy: false })).not.toContain('disabled=""');
  });

  it("shows the empty text when there are no rows", () => {
    expect(html([], { empty: "Hech narsa topilmadi" })).toContain("Hech narsa topilmadi");
  });
});
