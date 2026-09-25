import { describe, expect, it } from "vitest";
import { departedTooltip } from "./departed-students-kpi-cards";

describe("departedTooltip", () => {
  const graceDays = { LEFT_GROUP: 21, FROZEN: 60 };

  it("names the grace period of each kind of stop", () => {
    expect(departedTooltip({ graceDays, pendingCount: 0 })).toBe(
      "Tanlangan davrda ketgan o'quvchilar, har biri bir marta.\n" +
        "Chetlatilgan kuni sanaladi. Guruhdan chiqqan o'quvchi 21 kun, " +
        "muzlatilgan o'quvchi 60 kun ichida qaytmasa, to'xtagan kuni sanaladi.",
    );
  });

  it("reads both periods from the API", () => {
    expect(
      departedTooltip({
        graceDays: { LEFT_GROUP: 7, FROZEN: 30 },
        pendingCount: 0,
      }),
    ).toContain("Guruhdan chiqqan o'quvchi 7 kun, muzlatilgan o'quvchi 30 kun");
  });

  it("says how many may still be added while some are pending", () => {
    expect(departedTooltip({ graceDays, pendingCount: 3 })).toMatch(
      /\nYana 3 nafari shu muddatda qaytmasa qo'shiladi\.$/,
    );
  });

  it("leaves that sentence out when nobody is pending", () => {
    const text = departedTooltip({ graceDays, pendingCount: 0 });
    expect(text).not.toContain("Yana");
    expect(text.endsWith("\n")).toBe(false);
  });
});
