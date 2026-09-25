import { describe, expect, it } from "vitest";
import { buildScoresPayload, scoreKey } from "./results-payload";

const SUBJECTS = [
  { id: "r", name: "Lesen", maxScore: 30 },
  { id: "w", name: "Schreiben", maxScore: 30 },
];

// Kelmagan odamga xato kiritilgan bahoni o'chirib bo'lmasdi: bo'shatilgan katak
// so'rovga umuman kirmasdi, server esa faqat upsert qilardi. Saqlash eski
// qiymatni qaytarar yoki "Saqlanadigan o'zgarish topilmadi" derdi.
describe("baholar so'rovi", () => {
  it("bo'shatilgan katakni score: null bilan yuboradi", () => {
    const initial = new Map([[scoreKey("p1", "r"), "25"]]);
    const edits = new Map<string, string>();

    const res = buildScoresPayload(SUBJECTS, ["p1"], edits, initial);

    expect(res).toEqual({
      ok: true,
      participants: [
        { participantId: "p1", scores: [{ subjectId: "r", score: null }] },
      ],
    });
  });

  it("hech qachon kiritilmagan bo'sh katakni yubormaydi", () => {
    const edits = new Map([[scoreKey("p1", "r"), "20"]]);

    const res = buildScoresPayload(SUBJECTS, ["p1"], edits, new Map());

    expect(res).toEqual({
      ok: true,
      participants: [
        { participantId: "p1", scores: [{ subjectId: "r", score: 20 }] },
      ],
    });
  });

  it("maksimumdan katta ballni rad etadi", () => {
    const edits = new Map([[scoreKey("p1", "w"), "31"]]);

    const res = buildScoresPayload(SUBJECTS, ["p1"], edits, new Map());

    expect(res.ok).toBe(false);
  });
});
