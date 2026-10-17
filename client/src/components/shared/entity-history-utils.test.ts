import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangedFields } from "./entity-history-changed-fields";
import { getActionInfo, getFieldLabel, type HistoryRecord } from "./entity-history-utils";

const row = (action: string) =>
  ({ action: "UPDATE", newValues: { action }, oldValues: { action: null } }) as unknown as HistoryRecord;

describe("lead owner history rows (ADR-0093)", () => {
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

describe("participation document history row", () => {
  const issued = (istisno: string | null) =>
    ({
      action: "CREATE",
      oldValues: null,
      newValues: {
        action: "QATNASHISH_HUJJATI_BERILDI",
        raqam: "TB-2026-0007",
        daraja: "A1",
        istisno,
      },
    }) as unknown as HistoryRecord;

  it("reads as «Qatnashganlik hujjati berildi»", () => {
    expect(getActionInfo(issued(null)).label).toBe("Qatnashganlik hujjati berildi");
  });

  it("labels the number, the level and the exemption", () => {
    expect(getFieldLabel("raqam")).toBe("Hujjat raqami");
    expect(getFieldLabel("daraja")).toBe("Daraja");
    expect(getFieldLabel("istisno")).toBe("Istisno");
  });

  it("shows the number and the level, and no exemption line for a normal issue", () => {
    const html = renderToStaticMarkup(createElement(ChangedFields, { record: issued(null) }));
    expect(html).toContain("Hujjat raqami:");
    expect(html).toContain("TB-2026-0007");
    expect(html).toContain("Daraja:");
    expect(html).not.toContain("Istisno");
    expect(html).not.toContain("raqam:");
  });

  it("adds «Istisno: <sabab>» when the CEO issued it as an exemption", () => {
    const html = renderToStaticMarkup(
      createElement(ChangedFields, { record: issued("Kasal bo'lgan, hujjati bor") }),
    );
    expect(html).toContain("Istisno:");
    expect(html).toContain("Kasal bo&#x27;lgan, hujjati bor");
  });
});
