import { describe, expect, it } from "vitest";
import {
  coverageLabel,
  coverageStatus,
  sectionStatuses,
  sumAudioOnly,
  sumWords,
  unitHasNoMaterial,
  unitTotals,
  worstStatus,
} from "./media-coverage-utils";
import type {
  MediaSectionCoverage,
  MediaUnitCoverage,
} from "./media-coverage-types";

function section(
  overrides: Partial<MediaSectionCoverage> = {},
): MediaSectionCoverage {
  return {
    sectionId: 1,
    code: "u01-s1",
    order: 1,
    titleUz: "Salomlashish",
    words: { total: 0, withAudio: 0, pictureEligible: 0, withImage: 0 },
    sentences: { total: 0, withAudio: 0 },
    phrases: { total: 0, withAudio: 0 },
    dialogLines: { total: 0, withAudio: 0 },
    ...overrides,
  };
}

function unit(overrides: Partial<MediaUnitCoverage> = {}): MediaUnitCoverage {
  return {
    unitId: 1,
    code: "u01",
    order: 1,
    titleUz: "Tanishuv",
    sections: [],
    ...overrides,
  };
}

describe("coverageStatus", () => {
  it("hech qanday material bo'lmasa 'na' qaytaradi", () => {
    expect(coverageStatus(0, 0)).toBe("na");
  });

  it("material bor, hech biri to'ldirilmagan bo'lsa 'none'", () => {
    expect(coverageStatus(0, 10)).toBe("none");
  });

  it("qisman to'ldirilgan bo'lsa 'partial'", () => {
    expect(coverageStatus(4, 10)).toBe("partial");
  });

  it("hammasi to'ldirilgan bo'lsa 'complete'", () => {
    expect(coverageStatus(10, 10)).toBe("complete");
  });
});

describe("coverageLabel", () => {
  it("material yo'q bo'lganda tire qaytaradi, '0/0' emas", () => {
    expect(coverageLabel(0, 0)).toBe("—");
  });

  it("bor material uchun 'have/total' formatida", () => {
    expect(coverageLabel(53, 53)).toBe("53/53");
    expect(coverageLabel(0, 40)).toBe("0/40");
  });
});

describe("rasm chizib bo'lmaydigan so'z — kamchilik emas", () => {
  it("pictureEligible nolga teng bo'lsa rasm ustuni 'na', 'none' emas", () => {
    // Butun bo'lim faqat mavhum so'zlardan iborat (masalan `weil`) — rasm
    // hech qachon so'ralmaydi, shuning uchun bu KAMCHILIK emas.
    const s = section({
      words: { total: 5, withAudio: 5, pictureEligible: 0, withImage: 0 },
    });
    const st = sectionStatuses(s);
    expect(st.wordsImage).toBe("na");
    expect(st.wordsAudio).toBe("complete");
  });

  it("rasmga yaroqli so'zlarning hammasi rasmga ega bo'lsa 'complete', umumiy so'z soniga qaramay", () => {
    // 20 so'zdan faqat 8 tasi rasmga yaroqli va ularning hammasi rasmga ega —
    // bu holat "12 tasi yetishmayapti" emas, "to'liq" deb o'qilishi kerak.
    const s = section({
      words: { total: 20, withAudio: 20, pictureEligible: 8, withImage: 8 },
    });
    expect(sectionStatuses(s).wordsImage).toBe("complete");
  });
});

describe("sumWords / sumAudioOnly", () => {
  it("bir nechta seksiyani to'g'ri jamlaydi", () => {
    const rows = [
      { total: 10, withAudio: 10, pictureEligible: 4, withImage: 2 },
      { total: 5, withAudio: 0, pictureEligible: 1, withImage: 0 },
    ];
    expect(sumWords(rows)).toEqual({
      total: 15,
      withAudio: 10,
      pictureEligible: 5,
      withImage: 2,
    });
  });

  it("bo'sh ro'yxat uchun hammasi nol", () => {
    expect(sumAudioOnly([])).toEqual({ total: 0, withAudio: 0 });
  });
});

describe("unitTotals / unitHasNoMaterial", () => {
  it("hech qanday seksiyasi yo'q unit — material yo'q deb belgilanadi", () => {
    expect(unitHasNoMaterial(unit({ sections: [] }))).toBe(true);
  });

  it("seksiyalari bor, lekin hammasi bo'sh bo'lsa ham material yo'q deb belgilanadi", () => {
    const u = unit({ sections: [section(), section({ sectionId: 2 })] });
    expect(unitHasNoMaterial(u)).toBe(true);
    expect(unitTotals(u).words.total).toBe(0);
  });

  it("kamida bitta material bo'lsa material bor deb belgilanadi", () => {
    const u = unit({
      sections: [
        section({
          words: { total: 1, withAudio: 0, pictureEligible: 0, withImage: 0 },
        }),
      ],
    });
    expect(unitHasNoMaterial(u)).toBe(false);
  });

  it("bir nechta seksiya bo'yicha jamlaydi (unit 1 raqamlariga mos misol)", () => {
    // Loyihadagi haqiqiy unit-1 raqamlari: 53 so'z, 37 gap, 18 ibora, 40
    // dialog qatori, 5 seksiya bo'yicha taqsimlangan.
    const u = unit({
      sections: [
        section({
          sectionId: 1,
          words: { total: 20, withAudio: 20, pictureEligible: 0, withImage: 0 },
          sentences: { total: 15, withAudio: 15 },
          phrases: { total: 8, withAudio: 0 },
          dialogLines: { total: 16, withAudio: 0 },
        }),
        section({
          sectionId: 2,
          words: { total: 33, withAudio: 33, pictureEligible: 0, withImage: 0 },
          sentences: { total: 22, withAudio: 22 },
          phrases: { total: 10, withAudio: 0 },
          dialogLines: { total: 24, withAudio: 0 },
        }),
      ],
    });
    const t = unitTotals(u);
    expect(t.words.total).toBe(53);
    expect(t.words.withAudio).toBe(53);
    expect(t.sentences.total).toBe(37);
    expect(t.phrases.total).toBe(18);
    expect(t.dialogLines.total).toBe(40);
  });
});

describe("worstStatus", () => {
  it("'none' 'partial'dan, 'partial' 'complete'dan og'irroq", () => {
    expect(worstStatus(["complete", "partial", "na"])).toBe("partial");
    expect(worstStatus(["complete", "none", "partial"])).toBe("none");
  });

  it("hammasi 'na' bo'lsa 'na' qaytaradi", () => {
    expect(worstStatus(["na", "na"])).toBe("na");
  });

  it("bo'sh ro'yxat uchun 'na'", () => {
    expect(worstStatus([])).toBe("na");
  });
});
