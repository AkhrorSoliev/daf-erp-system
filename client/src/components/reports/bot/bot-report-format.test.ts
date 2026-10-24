import { describe, expect, it } from "vitest";
import { cohortTitle, dateTime, joinedHint, rateText, settled, STATE_LABEL, stateTone } from "./bot-report-format";

describe("bot-report-format", () => {
  it("rateText prints the server's whole percent", () => {
    expect(rateText(70)).toBe("70%");
    expect(rateText(0)).toBe("0%");
  });

  it("joinedHint reads the rate against the stopped people, or says nobody was stopped", () => {
    expect(joinedHint(120, 70)).toBe("70% to'xtatilganlardan");
    expect(joinedHint(0, 0)).toBe("to'xtatilgan odam yo'q");
  });

  it("cohortTitle puts the month in the locative", () => {
    expect(cohortTitle("2026-09")).toBe("Sentabrda bot to'xtatgan odamlar");
    expect(cohortTitle("2026-05")).toBe("Mayda bot to'xtatgan odamlar");
    expect(cohortTitle("2026-12")).toBe("Dekabrda bot to'xtatgan odamlar");
  });

  it("names every state and gives each a tone", () => {
    expect(STATE_LABEL).toEqual({ waiting: "Hali a'zo emas", joined: "A'zo", left: "Chiqib ketgan" });
    expect(stateTone("joined")).toBe("default");
    expect(stateTone("waiting")).toBe("secondary");
    expect(stateTone("left")).toBe("destructive");
  });

  it("dateTime reads the Tashkent clock, never the browser's, and dashes an empty value", () => {
    // 20:00 UTC on 30.09 is 01:00 on 01.10 in Tashkent.
    expect(dateTime("2026-09-30T20:00:00.000Z")).toBe("01.10.2026, 01:00");
    expect(dateTime(null)).toBe("—");
  });

  it("settled hides an answer kept from another month, page or size", () => {
    expect(settled("x", false)).toBe("x");
    expect(settled("x", true)).toBeUndefined();
    expect(settled(undefined, false)).toBeUndefined();
  });
});
