import { describe, expect, it } from "vitest";
import { freezePreviewLists, monthlyReleaseLabel } from "./freeze-refund-preview";

const sp = (s: string) => s.replace(/\s/g, " ");

describe("monthlyReleaseLabel", () => {
  it("says how many of the month's lessons come back and for how much", () => {
    expect(sp(monthlyReleaseLabel({ releaseLessons: 8, releaseAmount: 276_920 }))).toBe(
      "Oyning qolgan 8 darsi uchun 276 920 so'm balansga qaytadi",
    );
  });
  it("says plainly when nothing comes back", () => {
    expect(monthlyReleaseLabel({ releaseLessons: 0, releaseAmount: 0 })).toBe(
      "Bu oydan qaytadigan dars yo'q — balans o'zgarmaydi",
    );
  });
});

describe("freezePreviewLists", () => {
  it("passes both lists through", () => {
    const monthly = [
      { enrollmentId: "e2", groupId: "g2", groupName: "B1", releaseLessons: 3, releaseAmount: 90_000 },
    ];
    expect(freezePreviewLists({ pack: [], monthly })).toEqual({ pack: [], monthly });
  });
  it("reads the old bare-array answer as nothing to show", () => {
    expect(freezePreviewLists([{ enrollmentId: "e1" }])).toEqual({ pack: [], monthly: [] });
  });
  it("is empty while loading", () => {
    expect(freezePreviewLists(undefined)).toEqual({ pack: [], monthly: [] });
  });
});
