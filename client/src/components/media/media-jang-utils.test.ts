import { describe, expect, it } from "vitest";
import {
  filtrla,
  javobChiplari,
  jamiSonlar,
  filtrFaolmi,
  type JangFilter,
} from "./media-jang-utils";
import type { JangQuestion, JangUnit } from "./media-jang-types";

function savol(over: Partial<JangQuestion> = {}): JangQuestion {
  return {
    id: 1,
    sourceId: "jang-a1-u02-001",
    raqam: "001",
    kind: "CHOOSE",
    prompt: "«ona» nemischa?",
    options: ["Mutter", "Vater"],
    answer: "Mutter",
    akzeptiert: [],
    status: "DRAFT",
    audio: null,
    ...over,
  };
}

function unit(questions: JangQuestion[], over: Partial<JangUnit> = {}): JangUnit {
  return {
    unitId: 2,
    code: "u02",
    order: 2,
    titleUz: "Oila",
    titleDe: "Familie",
    fayl: "a1-u02.json",
    counts: {
      jami: questions.length,
      tasdiqlangan: 0,
      qoralama: questions.length,
      choose: 0,
      type: 0,
      listen: 0,
    },
    questions,
    ...over,
  };
}

const BARCHASI: JangFilter = { search: "", kind: "ALL", status: "ALL" };

describe("filtrla", () => {
  const units = [
    unit([
      savol(),
      savol({
        id: 2,
        sourceId: "jang-a1-u02-002",
        raqam: "002",
        kind: "TYPE",
        prompt: "«Bruder» nemischa yozing",
        options: [],
        answer: "Bruder",
        akzeptiert: ["der Bruder"],
        status: "APPROVED",
      }),
    ]),
    unit([savol({ id: 3, sourceId: "jang-a1-u03-001", prompt: "uy" })], {
      unitId: 3,
      code: "u03",
    }),
  ];

  it("filtrsiz hammasini qaytaradi", () => {
    expect(filtrla(units, BARCHASI)).toBe(units);
  });

  it("turi bo'yicha saralaydi va bo'sh unitni tashlaydi", () => {
    const r = filtrla(units, { ...BARCHASI, kind: "TYPE" });
    expect(r).toHaveLength(1);
    expect(r[0].questions.map((q) => q.raqam)).toEqual(["002"]);
  });

  it("holati bo'yicha saralaydi", () => {
    const r = filtrla(units, { ...BARCHASI, status: "APPROVED" });
    expect(r.flatMap((u) => u.questions).map((q) => q.raqam)).toEqual(["002"]);
  });

  it("qidiruv savol, variant, javob, raqam va qo'shimcha yozuvdan topadi", () => {
    const nomlar = (s: string) =>
      filtrla(units, { ...BARCHASI, search: s })
        .flatMap((u) => u.questions)
        .map((q) => q.sourceId);
    expect(nomlar("bruder")).toEqual(["jang-a1-u02-002"]);
    expect(nomlar("VATER")).toEqual(["jang-a1-u02-001", "jang-a1-u03-001"]);
    expect(nomlar("jang-a1-u03-001")).toEqual(["jang-a1-u03-001"]);
    expect(nomlar("der bruder")).toEqual(["jang-a1-u02-002"]);
    expect(nomlar("  uy  ")).toEqual(["jang-a1-u03-001"]);
  });

  it("hech narsa mos kelmasa bo'sh ro'yxat", () => {
    expect(filtrla(units, { ...BARCHASI, search: "zzz" })).toEqual([]);
  });

  it("unitning o'z ma'lumotini saqlaydi", () => {
    const r = filtrla(units, { ...BARCHASI, kind: "TYPE" });
    expect(r[0].code).toBe("u02");
    expect(r[0].counts.jami).toBe(2);
  });
});

describe("filtrFaolmi", () => {
  it("bo'sh qidiruv va «Barchasi» faol emas", () => {
    expect(filtrFaolmi(BARCHASI)).toBe(false);
    expect(filtrFaolmi({ ...BARCHASI, search: "   " })).toBe(false);
  });
  it("qidiruv, tur yoki holat faol deb hisoblanadi", () => {
    expect(filtrFaolmi({ ...BARCHASI, search: "a" })).toBe(true);
    expect(filtrFaolmi({ ...BARCHASI, kind: "LISTEN" })).toBe(true);
    expect(filtrFaolmi({ ...BARCHASI, status: "DRAFT" })).toBe(true);
  });
});

describe("jamiSonlar", () => {
  it("unitlar sonlarini qo'shadi", () => {
    const a = unit([], {
      counts: { jami: 3, tasdiqlangan: 1, qoralama: 2, choose: 1, type: 1, listen: 1 },
    });
    const b = unit([], {
      counts: { jami: 2, tasdiqlangan: 0, qoralama: 2, choose: 2, type: 0, listen: 0 },
    });
    expect(jamiSonlar([a, b])).toEqual({ jami: 5, tasdiqlangan: 1, qoralama: 4 });
  });
});

describe("javobChiplari", () => {
  it("variantlarni beradi, to'g'risini belgilaydi", () => {
    expect(javobChiplari(savol())).toEqual([
      { text: "Mutter", togri: true },
      { text: "Vater", togri: false },
    ]);
  });

  it("variantsiz (Yozish) savolda javobning o'zini beradi", () => {
    expect(
      javobChiplari(savol({ kind: "TYPE", options: [], answer: "Bruder" })),
    ).toEqual([{ text: "Bruder", togri: true }]);
  });

  it("javob variantlar orasida bo'lmasa, uni alohida to'g'ri chip qilib qo'shadi", () => {
    expect(
      javobChiplari(savol({ options: ["a", "b"], answer: "c" })),
    ).toEqual([
      { text: "a", togri: false },
      { text: "b", togri: false },
      { text: "c", togri: true },
    ]);
  });
});
