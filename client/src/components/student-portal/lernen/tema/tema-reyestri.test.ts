import { describe, expect, it } from "vitest";
import { LERNEN_TEMA_IDLARI, TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { TEMALAR, temaTop } from "./tema-reyestri";

describe("tema reyestri", () => {
  it("has a theme for every look marked as finished", () => {
    for (const t of TAYYOR_TEMALAR) expect(TEMALAR[t.id]).toBeDefined();
  });
  it("every finished theme draws the result background, the unit header and the lesson places (ADR-0128, ADR-0131)", () => {
    for (const tema of Object.values(TEMALAR)) {
      expect(tema?.MukofotFoni, `${tema?.id}: MukofotFoni`).toBeTruthy();
      expect(tema?.UnitLavha, `${tema?.id}: UnitLavha`).toBeTruthy();
      expect(tema?.UnitJoyi, `${tema?.id}: UnitJoyi`).toBeTruthy();
    }
  });
  it("draws the default for a look that is not built yet", () => {
    for (const id of LERNEN_TEMA_IDLARI) {
      const tema = temaTop(id);
      expect(tema.TugunBelgisi, `${id}: TugunBelgisi`).toBeTruthy();
      expect(tema.MukofotFoni, `${id}: MukofotFoni`).toBeTruthy();
      expect(tema.UnitLavha, `${id}: UnitLavha`).toBeTruthy();
      expect(tema.UnitJoyi, `${id}: UnitJoyi`).toBeTruthy();
    }
    expect(temaTop("alp").id).toBe("toza");
  });

  it("«Toza» draws no scene: the plain app background stays", () => {
    expect(temaTop("toza").Sahna).toBeUndefined();
  });
});
