import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GOLIB_MIN_AZO,
  GOLIB_MIN_BALL,
  KOTARILISH_MIN_AZO,
  KOTARILISH_MIN_BALL,
  LIGA_NOMLARI,
  bahoMatni,
  haftaMatni,
  kotarilishMatni,
  ligaSarlavhasi,
  otganHaftaMatni,
  zonadami,
} from "./liga";

// A marking `t`: every text it receives comes back in brackets, filled in.
const t = (s: string, p?: Record<string, string | number>) =>
  `[${s.replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k]))}]`;

describe("the page's t", () => {
  it("translates the client's words, never the data", () => {
    expect(haftaMatni("2026-10-25", "2026-10-19", 22, t)).toBe("[Hafta tugashiga 7 kun] · [22 kishi]");
    expect(kotarilishMatni({ soni: 0, faol: false }, t)).toBe(
      "[Eng yuqori liga — bu yerdan ko'tarilish yo'q]",
    );
    expect(
      otganHaftaMatni(
        { daraja: { tier: 0, nomi: "Bronza" }, orin: 3, kotarildi: true, hajmi: 22 },
        { tier: 1, nomi: "Kumush" },
        t,
      ),
    ).toBe("[Siz 3-o'rin · [Kumush] ligasiga ko'tarildingiz]");
    // A league name this client does not know prints as sent.
    expect(ligaSarlavhasi("Temir", t)).toBe("[Temir ligasi]");
    expect(bahoMatni(12.5, t)).toBe("[12,5 ball]");
  });
});

// The client cannot import server code; names and limits must still be the server's.
const server = readFileSync(
  join(__dirname, "../../../../../server/src/daf/liga/liga-qoidalari.ts"),
  "utf8",
);
const son = (nom: string) => {
  const m = new RegExp(`export const ${nom} = (\\d+);`).exec(server);
  expect(m, `${nom} not found in liga-qoidalari.ts`).not.toBeNull();
  return Number(m![1]);
};

describe("liga konstantalari serverniki bilan bir xil", () => {
  it("nomlar va chegaralar", () => {
    const nomlar = /LIGA_NOMLARI = \[([^\]]+)\]/
      .exec(server)![1]
      .match(/'([^']+)'/g)!
      .map((s) => s.slice(1, -1));
    expect([...LIGA_NOMLARI]).toEqual(nomlar);
    expect(KOTARILISH_MIN_BALL).toBe(son("KOTARILISH_MIN_BALL"));
    expect(KOTARILISH_MIN_AZO).toBe(son("KOTARILISH_MIN_AZO"));
    expect(GOLIB_MIN_BALL).toBe(son("GOLIB_MIN_BALL"));
    expect(GOLIB_MIN_AZO).toBe(son("GOLIB_MIN_AZO"));
  });
});

describe("haftaMatni", () => {
  it("dushanba — 7 kun, shanba — 2 kun, yakshanba — bugun tugaydi", () => {
    expect(haftaMatni("2026-10-25", "2026-10-19", 22)).toBe("Hafta tugashiga 7 kun · 22 kishi");
    expect(haftaMatni("2026-10-25", "2026-10-24", 22)).toBe("Hafta tugashiga 2 kun · 22 kishi");
    expect(haftaMatni("2026-10-25", "2026-10-25", null)).toBe("Hafta bugun tugaydi");
  });
});

describe("kotarilishMatni", () => {
  it("faol zona, kichik xona, Olmos", () => {
    expect(kotarilishMatni({ soni: 5, faol: true })).toBe(
      "Birinchi 5 tasi, kamida 50 ball topgan bo'lsa, ko'tariladi",
    );
    expect(kotarilishMatni({ soni: 5, faol: false })).toBe(
      "Xona hali kichik — ko'tarilish kamida 15 kishi bo'lganda",
    );
    expect(kotarilishMatni({ soni: 0, faol: false })).toBe(
      "Eng yuqori liga — bu yerdan ko'tarilish yo'q",
    );
  });
});

describe("otganHaftaMatni", () => {
  it("ko'tarilgan va ko'tarilmagan", () => {
    const kumush = { tier: 1, nomi: "Kumush" };
    expect(
      otganHaftaMatni({ daraja: { tier: 0, nomi: "Bronza" }, orin: 3, kotarildi: true, hajmi: 22 }, kumush),
    ).toBe("Siz 3-o'rin · Kumush ligasiga ko'tarildingiz");
    expect(otganHaftaMatni({ daraja: kumush, orin: 8, kotarildi: false, hajmi: 22 }, kumush)).toBe(
      "Siz 8-o'rin · 22 kishi",
    );
  });
});

describe("zonadami va bahoMatni", () => {
  it("zona faqat faol bo'lsa va birinchi `soni` ta", () => {
    expect(zonadami(5, { soni: 5, faol: true })).toBe(true);
    expect(zonadami(6, { soni: 5, faol: true })).toBe(false);
    expect(zonadami(1, { soni: 5, faol: false })).toBe(false);
  });

  it("o'nlik vergul bilan", () => {
    expect(bahoMatni(12.5)).toBe("12,5 ball");
    expect(bahoMatni(30)).toBe("30 ball");
  });
});
