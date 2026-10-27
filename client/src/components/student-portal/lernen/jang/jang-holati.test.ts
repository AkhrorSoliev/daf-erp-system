import { describe, expect, it } from "vitest";
import { jangReducer, type JangBosqichi } from "./jang-holati";
import type { JangBoshlandi } from "../types";

const jang: JangBoshlandi = {
  jangId: 1,
  kirishMs: 3000,
  raqib: { tur: "BOT", studentId: null, ism: "Dafi bot", rasm: null, golibSoni: null },
  savollar: [0, 1].map((pozitsiya) => ({ pozitsiya, kind: "CHOOSE" as const, prompt: "?", options: ["a", "b", "c"], audio: null })),
};
const natija = (togri: boolean, raqib: boolean) => ({ togri, togriJavob: "a", raqib: { togri: raqib, ms: 4000 } });

describe("jangReducer", () => {
  it("to'liq yo'l: kirish → savol → javob → savol → javob → tugadi", () => {
    let h: JangBosqichi | null = jangReducer(null, { tur: "boshlandi", jang });
    expect(h?.tur).toBe("kirish");
    h = jangReducer(h, { tur: "kirish-tugadi" });
    expect(h).toMatchObject({ tur: "savol", pozitsiya: 0, hisob: { men: 0, raqib: 0 } });
    h = jangReducer(h, { tur: "javob-keldi", natija: natija(true, false), berilgan: "a" });
    expect(h).toMatchObject({ tur: "javob", hisob: { men: 1, raqib: 0 } });
    h = jangReducer(h, { tur: "keyingi" });
    expect(h).toMatchObject({ tur: "savol", pozitsiya: 1 });
    h = jangReducer(h, { tur: "javob-keldi", natija: natija(false, true), berilgan: "" });
    h = jangReducer(h, { tur: "keyingi" });
    expect(h).toMatchObject({ tur: "tugadi", hisob: { men: 1, raqib: 1 } });
  });
  it("noto'g'ri bosqichdagi harakat e'tiborsiz", () => {
    const h = jangReducer(null, { tur: "boshlandi", jang });
    expect(jangReducer(h, { tur: "keyingi" })).toBe(h);
  });
});
