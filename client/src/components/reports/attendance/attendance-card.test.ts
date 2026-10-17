import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttendanceCard } from "./attendance-card";
import type { AttendanceOverview } from "./attendance-types";

const data = {
  range: { startDate: "2026-09-01", endDate: "2026-09-30" },
  previous: { startDate: "2026-08-01", endDate: "2026-08-31" },
  card: { counts: { came: 3870, late: 27, absent: 917, excused: 41, cancelled: 0 }, lessons: 4814, attended: 3897, rate: 81, previousRate: 79 },
} as AttendanceOverview;
const html = (d: AttendanceOverview, preset = "last_month") =>
  renderToStaticMarkup(createElement(AttendanceCard, { data: d, preset })).replaceAll("&#x27;", "'");

describe("AttendanceCard", () => {
  it("prints the server's rate, the month before and the lessons sentence", () => {
    const h = html(data);
    expect(h).toContain("Sentabr davomati");
    expect(h).toContain(">81%<");
    expect(h).toContain("avgustda 79% edi");
    expect(h).toContain("darsdan");
  });

  it("no denominator: «—», never 0%", () => {
    expect(html({ ...data, card: { ...data.card, rate: null } })).toContain(">—<");
  });

  it("the cancelled-lessons line only when there are some", () => {
    expect(html(data)).not.toContain("Markaz bekor qilgan");
    expect(html({ ...data, card: { ...data.card, counts: { ...data.card.counts, cancelled: 12 } } })).toContain("Markaz bekor qilgan darslar: 12 ta");
  });

  it("«Bosh sahifadagi davomat ham shu raqam» only for «Bu oy»", () => {
    expect(html(data, "current_month")).toContain("Bosh sahifadagi davomat ham shu raqam");
    expect(html(data, "last_month")).not.toContain("Bosh sahifadagi");
  });
});
