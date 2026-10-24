import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttendanceCredit } from "./attendance-credit";
import type { CreditResult } from "./attendance-types";

const html = (credit: CreditResult) =>
  renderToStaticMarkup(createElement(AttendanceCredit, { credit, cancelled: 0 })).replaceAll("&#x27;", "'");

describe("AttendanceCredit", () => {
  it("the setting off: no «hisoblanmagan» note next to the switched-off sentence", () => {
    const h = html({ lessons: 5, students: 4, amount: null, enabled: false, uncharged: 5 });
    expect(h).toContain("Sababli dars chegirmasi o'chirilgan.");
    expect(h).not.toContain("hali hisoblanmagan, summaga kirmadi");
  });

  it("the setting on: the uncharged note stays", () => {
    const h = html({ lessons: 5, students: 4, amount: 100_000, enabled: true, uncharged: 2 });
    expect(h).toContain("Shundan 2 tasining oyi hali hisoblanmagan, summaga kirmadi.");
  });
});
