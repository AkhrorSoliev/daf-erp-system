import { describe, expect, it } from "vitest";
import { LERNEN_TEMA_IDLARI, TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { TEMALAR, temaTop } from "./tema-reyestri";

describe("tema reyestri", () => {
  it("has a theme for every look marked as finished", () => {
    for (const t of TAYYOR_TEMALAR) expect(TEMALAR[t.id]).toBeDefined();
  });
  it("draws the default for a look that is not built yet", () => {
    for (const id of LERNEN_TEMA_IDLARI) expect(temaTop(id).TugunBelgisi).toBeTruthy();
    expect(temaTop("alp").id).toBe("toza");
  });
});
