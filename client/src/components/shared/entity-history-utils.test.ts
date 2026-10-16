import { describe, expect, it } from "vitest";
import { getActionInfo, getFieldLabel, type HistoryRecord } from "./entity-history-utils";

const row = (action: string) =>
  ({ action: "UPDATE", newValues: { action }, oldValues: { action: null } }) as unknown as HistoryRecord;

describe("lead owner history rows (ADR-0092)", () => {
  it.each([
    ["LID_BAND_QILINDI", "Lid band qilindi"],
    ["LID_BERILDI", "Lid boshqaga berildi"],
    ["LID_BOSHATILDI", "Lid bo'shatildi"],
    ["LID_QAYTDI", "Muddat o'tib qaytdi"],
  ])("%s reads as «%s»", (action, label) => {
    expect(getActionInfo(row(action)).label).toBe(label);
  });

  it("labels the owner and reason fields", () => {
    expect(getFieldLabel("masul")).toBe("Mas'ul");
    expect(getFieldLabel("sabab")).toBe("Sabab");
  });
});
