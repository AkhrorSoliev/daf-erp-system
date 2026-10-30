import { describe, expect, it } from "vitest";
import type { MediaLevelCoverage, MediaSectionCoverage } from "./media-coverage-types";
import {
  boshlangichTanlov,
  bolimJoyi,
  kamchilik,
  seansJoyi,
  tanlovParamlari,
  tanlovUnitId,
  tanlovniOqi,
} from "./media-daraxt";

function bolim(id: number, lessons: MediaSectionCoverage["lessons"] = []): MediaSectionCoverage {
  return {
    sectionId: id,
    code: `s${id}`,
    order: id,
    titleUz: `B${id}`,
    words: { total: 10, withAudio: 7, pictureEligible: 4, withImage: 1 },
    sentences: { total: 5, withAudio: 5 },
    phrases: { total: 2, withAudio: 1 },
    dialogLines: { total: 4, withAudio: 3 },
    lessons,
  };
}

const levels: MediaLevelCoverage[] = [
  {
    level: "A1",
    units: [
      { unitId: 1, code: "u01", order: 1, titleUz: "Bo'sh", sections: [], unitLessons: [] },
      {
        unitId: 2,
        code: "u02",
        order: 2,
        titleUz: "Oila",
        sections: [bolim(20, [{ id: 201, kind: "SECTION_A", order: 1 }]), bolim(21)],
        unitLessons: [{ id: 299, kind: "UNIT_TEST", order: 9 }],
      },
    ],
  },
];

describe("tanlovniOqi", () => {
  const get = (q: Record<string, string>) => (k: string) => q[k] ?? null;
  it("bolim va seansni o'qiydi", () => {
    expect(tanlovniOqi(get({ bolim: "20" }))).toEqual({ tur: "bolim", id: 20 });
    expect(tanlovniOqi(get({ seans: "201" }))).toEqual({ tur: "seans", id: 201 });
  });
  it("seans bolimdan ustun, yaroqsiz qiymat — null", () => {
    expect(tanlovniOqi(get({ bolim: "20", seans: "201" }))).toEqual({ tur: "seans", id: 201 });
    expect(tanlovniOqi(get({ bolim: "abc" }))).toBeNull();
    expect(tanlovniOqi(get({}))).toBeNull();
  });
});

describe("tanlovParamlari", () => {
  it("bitta kalit yozadi", () => {
    expect(tanlovParamlari({ tur: "bolim", id: 20 })).toBe("bolim=20");
    expect(tanlovParamlari({ tur: "seans", id: 201 })).toBe("seans=201");
  });
});

describe("joylar", () => {
  it("boshlang'ich tanlov — bo'limi bor birinchi unitning birinchi bo'limi", () => {
    expect(boshlangichTanlov(levels)).toEqual({ tur: "bolim", id: 20 });
    expect(boshlangichTanlov([])).toBeNull();
  });
  it("bo'lim va seansni topadi, unit darajasidagi seansni ham", () => {
    expect(bolimJoyi(levels, 21)?.unit.unitId).toBe(2);
    expect(bolimJoyi(levels, 999)).toBeNull();
    expect(seansJoyi(levels, 201)?.section?.sectionId).toBe(20);
    const test = seansJoyi(levels, 299);
    expect(test?.section).toBeNull();
    expect(test?.lesson.kind).toBe("UNIT_TEST");
    expect(seansJoyi(levels, 999)).toBeNull();
  });
  it("tanlov unitini beradi", () => {
    expect(tanlovUnitId(levels, { tur: "bolim", id: 21 })).toBe(2);
    expect(tanlovUnitId(levels, { tur: "seans", id: 299 })).toBe(2);
    expect(tanlovUnitId(levels, null)).toBeNull();
  });
});

describe("kamchilik", () => {
  it("ovozsiz va rasmsiz elementlarni sanaydi", () => {
    // ovoz: so'z 3 + gap 0 + ibora 1 + dialog 1 = 5; rasm: 4 - 1 = 3
    expect(kamchilik(bolim(1))).toEqual({ ovoz: 5, rasm: 3 });
  });
});
