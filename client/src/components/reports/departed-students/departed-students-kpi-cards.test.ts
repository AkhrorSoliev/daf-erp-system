import { describe, expect, it } from "vitest";
import { departedTooltip } from "./departed-students-kpi-cards";

describe("departedTooltip", () => {
  it("says how many may still be added while some are pending", () => {
    expect(departedTooltip({ graceDays: 21, pendingCount: 3 })).toContain(
      "Yana 3 nafari 21 kun ichida qaytmasa qo'shiladi.",
    );
  });

  it("leaves that sentence out when nobody is pending", () => {
    const text = departedTooltip({ graceDays: 21, pendingCount: 0 });
    expect(text).toContain("21 kun ichida qaytmasa, to'xtagan kuni sanaladi.");
    expect(text).not.toContain("Yana");
    expect(text.endsWith("\n")).toBe(false);
  });
});
