import { describe, expect, it } from "vitest";
import { interpolate } from "@/i18n/translate";
import {
  DEFAULT_DEPARTURE_POLICY,
  departureConsequence,
  departurePolicyPayload,
  factsLine,
  lessonChips,
  monthlyRows,
  offeredPolicies,
  policyHint,
  policyTitle,
  withheldWarning,
  type DepartureMonth,
  type DeparturePreview,
} from "./departure-money";

// Intl's uz-UZ groups thousands with a no-break space; the assertions read
// better with an ordinary one.
const plain = (s: string) => s.split(String.fromCharCode(160)).join(" ");

const OCTOBER = [
  "2026-10-02",
  "2026-10-05",
  "2026-10-07",
  "2026-10-09",
  "2026-10-12",
  "2026-10-14",
  "2026-10-16",
  "2026-10-19",
  "2026-10-21",
  "2026-10-23",
  "2026-10-26",
  "2026-10-28",
  "2026-10-30",
];

const month = (over: Partial<DepartureMonth> = {}): DepartureMonth => ({
  period: "2026-10",
  departureDay: "2026-10-14",
  lessonDates: OCTOBER,
  held: 6,
  covered: 13,
  heldPercent: 46,
  threshold: 40,
  contractApplies: true,
  chargedAmount: 1040000,
  outcomes: {
    STUDENT_CANCELLED: { lessons: 0, amount: 0, withheld: true },
    LEVEL_COMPLETED: { lessons: 7, amount: 560000, withheld: false },
    CENTER_INITIATIVE: { lessons: 7, amount: 560000, withheld: false },
    QUALITY_CLAIM: { lessons: 13, amount: 1040000, withheld: false },
  },
  ...over,
});

const preview = (
  over: Partial<DeparturePreview> = {},
  m: DepartureMonth | null = month(),
): DeparturePreview => ({
  departureDay: "2026-10-14",
  balance: 0,
  mayChoosePolicy: true,
  defaultPolicy: "STUDENT_CANCELLED",
  enrollments: [
    {
      enrollmentId: "enr-1",
      groupId: "g-1",
      groupName: "A1-12",
      status: "ACTIVE",
      month: m,
    },
  ],
  ...over,
});

describe("departure money block (contract 6.2, ADR-0043)", () => {
  it("draws nothing for a lesson pack or a month with no charge", () => {
    expect(monthlyRows(preview({}, null))).toEqual([]);
    expect(monthlyRows(undefined)).toEqual([]);
    expect(departureConsequence(preview({}, null), "STUDENT_CANCELLED")).toBe(
      null,
    );
  });

  it("states the month and how much of it was held", () => {
    const f = factsLine(month());
    expect(plain(f.lead)).toBe(
      "Oktabr: 13 dars, 1 040 000 so'm. Bugun 14.10, o'tgani:",
    );
    expect(f.held).toBe("6 ta (46%)");
  });

  it("marks the lessons held up to today", () => {
    const chips = lessonChips(month());
    expect(chips).toHaveLength(13);
    expect(chips.slice(0, 7).map((c) => [c.day, c.held])).toEqual([
      [2, true],
      [5, true],
      [7, true],
      [9, true],
      [12, true],
      [14, true],
      [16, false],
    ]);
  });

  it("explains the student's own decision by the share and the threshold", () => {
    expect(policyHint("STUDENT_CANCELLED", month())).toBe(
      "13 darsdan 6 tasi o'tgan (40% dan ko'p) — pul qaytmaydi",
    );
    expect(
      policyHint("STUDENT_CANCELLED", month({ held: 5, heldPercent: 38 })),
    ).toBe(
      "13 darsdan 5 tasi o'tgan (40% dan ko'p emas) — o'tilmagan darslar puli qaytadi",
    );
    expect(
      policyHint("STUDENT_CANCELLED", month({ contractApplies: false })),
    ).toBe(
      "Shartnoma 6.2 hali kuchga kirmagan — o'tilmagan darslar puli qaytadi",
    );
    expect(policyHint("LEVEL_COMPLETED", month())).toBe(
      "Sertifikat oldi yoki keyingi darajaga o'tadi — o'tilmagan darslar puli qaytadi",
    );
    expect(policyHint("CENTER_INITIATIVE", month())).toBe(
      "O'tilmagan darslar puli qaytadi",
    );
    expect(policyHint("QUALITY_CLAIM", month())).toBe(
      "Oyning to'liq puli qaytadi",
    );
  });

  it("warns that nothing comes back once more than the threshold was held", () => {
    const c = departureConsequence(preview(), "STUDENT_CANCELLED")!;
    expect(c.tone).toBe("warning");
    expect(c.head).toBe("Pul qaytmaydi");
    expect(c.line).toBe("Oy darslarining 46% o'tgan. Balans o'zgarmaydi.");
  });

  it("tells a debtor their debt stays", () => {
    const c = departureConsequence(
      preview({ balance: -1040000 }),
      "STUDENT_CANCELLED",
    )!;
    expect(plain(c.line)).toBe(
      "Oy darslarining 46% o'tgan. Qarz o'zgarmaydi: 1 040 000 so'm.",
    );
  });

  it("shows the unheld lessons coming back to a paid balance", () => {
    const c = departureConsequence(preview(), "CENTER_INITIATIVE")!;
    expect(c.tone).toBe("success");
    expect(plain(c.head)).toBe(
      "7 ta o'tilmagan dars puli qaytadi: 560 000 so'm",
    );
    expect(plain(c.line)).toBe(
      "Balans: 0 → 560 000 so'm. Naqd pulni keyin «Pul qaytarish» orqali berasiz.",
    );
  });

  it("shows how the return shrinks a debt", () => {
    const c = departureConsequence(
      preview({ balance: -1040000 }),
      "CENTER_INITIATIVE",
    )!;
    expect(plain(c.line)).toBe("Qarz: 1 040 000 → 480 000 so'm.");
  });

  it("returns the whole month on a quality claim, the teacher's pay untouched", () => {
    const c = departureConsequence(preview(), "QUALITY_CLAIM")!;
    expect(plain(c.head)).toBe("Oyning to'liq puli qaytadi: 1 040 000 so'm");
    expect(plain(c.line)).toBe(
      "Balans: 0 → 1 040 000 so'm. Naqd pulni keyin «Pul qaytarish» orqali berasiz. Ustoz oyligi kamaymaydi, farqni markaz qoplaydi.",
    );
  });

  it("returns the whole month for a trial lesson (contract 3.5) under the default policy", () => {
    const trial = month({
      departureDay: "2026-10-02",
      held: 1,
      heldPercent: 8,
      trialLesson: true,
      outcomes: {
        STUDENT_CANCELLED: { lessons: 13, amount: 1040000, withheld: false },
        LEVEL_COMPLETED: { lessons: 13, amount: 1040000, withheld: false },
        CENTER_INITIATIVE: { lessons: 13, amount: 1040000, withheld: false },
        QUALITY_CLAIM: { lessons: 13, amount: 1040000, withheld: false },
      },
    });
    const c = departureConsequence(preview({}, trial), "STUDENT_CANCELLED")!;
    expect(plain(c.head)).toBe(
      "Sinov darsi (3.5): oyning puli to'liq qaytadi — 1 040 000 so'm",
    );
    expect(c.line).toContain(
      "Ustozga bu oyning darslari uchun haq yozilmaydi.",
    );
    expect(policyHint("STUDENT_CANCELLED", trial)).toBe(
      "Sinov darsi (3.5) — oyning to'liq puli qaytadi",
    );
  });

  it("says a trial month that cost nothing gives nothing back, the teacher still unpaid", () => {
    const none = { lessons: 0, amount: 0, withheld: false };
    const free = month({
      departureDay: "2026-10-02",
      held: 1,
      heldPercent: 8,
      trialLesson: true,
      chargedAmount: 0,
      outcomes: {
        STUDENT_CANCELLED: none,
        LEVEL_COMPLETED: none,
        CENTER_INITIATIVE: none,
        QUALITY_CLAIM: none,
      },
    });
    const c = departureConsequence(preview({}, free), "STUDENT_CANCELLED")!;
    expect(c.tone).toBe("neutral");
    expect(c.head).toBe("Sinov darsi (3.5): qaytadigan pul yo'q");
    expect(c.line).toBe("Ustozga bu oyning darslari uchun haq yozilmaydi.");
  });

  it("asks for the «Dars bo'ldimi?» answer first when it decides the trial lesson", () => {
    const text =
      "Avval «Dars bo'ldimi?» savoliga javob bering: 05.10 (#014). Sinov darsi o'quvchi shu darsda bo'lgan-bo'lmaganiga qarab hal bo'ladi.";
    const waiting = month({ trialAwaitsAnswer: text });
    for (const policy of ["STUDENT_CANCELLED", "QUALITY_CLAIM"] as const) {
      const c = departureConsequence(preview({}, waiting), policy)!;
      expect(c.tone).toBe("warning");
      expect(c.head).toBe(text);
      expect(c.line).toBe("");
    }
  });

  it("closes a debt the return is bigger than", () => {
    const c = departureConsequence(
      preview({ balance: -300000 }),
      "QUALITY_CLAIM",
    )!;
    expect(plain(c.line)).toBe(
      "Qarz yopiladi, balansda 740 000 so'm qoladi. Naqd pulni keyin «Pul qaytarish» orqali berasiz. Ustoz oyligi kamaymaydi, farqni markaz qoplaydi.",
    );
  });

  it("says a month that has not started comes back in full", () => {
    const c = departureConsequence(
      preview(
        {},
        month({
          held: 0,
          heldPercent: 0,
          outcomes: {
            STUDENT_CANCELLED: {
              lessons: 13,
              amount: 1040000,
              withheld: false,
            },
            LEVEL_COMPLETED: {
              lessons: 13,
              amount: 1040000,
              withheld: false,
            },
            CENTER_INITIATIVE: {
              lessons: 13,
              amount: 1040000,
              withheld: false,
            },
            QUALITY_CLAIM: { lessons: 13, amount: 1040000, withheld: false },
          },
        }),
      ),
      "STUDENT_CANCELLED",
    )!;
    expect(plain(c.head)).toBe(
      "Hali dars o'tmagan: 13 dars puli to'liq qaytadi, 1 040 000 so'm",
    );
  });

  it("says so when every lesson of the month is past", () => {
    const c = departureConsequence(
      preview(
        {},
        month({
          held: 13,
          heldPercent: 100,
          outcomes: {
            STUDENT_CANCELLED: { lessons: 0, amount: 0, withheld: false },
            LEVEL_COMPLETED: { lessons: 0, amount: 0, withheld: false },
            CENTER_INITIATIVE: { lessons: 0, amount: 0, withheld: false },
            QUALITY_CLAIM: { lessons: 13, amount: 1040000, withheld: false },
          },
        }),
      ),
      "CENTER_INITIATIVE",
    )!;
    expect(c).toEqual({
      tone: "neutral",
      head: "Qaytadigan dars yo'q",
      line: "Oyning hamma darslari o'tgan.",
    });
  });

  it("returns the unheld lessons to a student who completed the level, past 40% too", () => {
    const c = departureConsequence(preview(), "LEVEL_COMPLETED")!;
    expect(c.tone).toBe("success");
    expect(plain(c.head)).toBe(
      "7 ta o'tilmagan dars puli qaytadi: 560 000 so'm",
    );
  });

  it("offers a CEO or branch director four ways out of a group, three for an expulsion", () => {
    expect(offeredPolicies("removal", true)).toEqual([
      "STUDENT_CANCELLED",
      "LEVEL_COMPLETED",
      "CENTER_INITIATIVE",
      "QUALITY_CLAIM",
    ]);
    expect(offeredPolicies("expel", true)).toEqual([
      "STUDENT_CANCELLED",
      "CENTER_INITIATIVE",
      "QUALITY_CLAIM",
    ]);
  });

  it("offers everyone else a completed level on a removal, and nothing to choose on an expulsion", () => {
    expect(offeredPolicies("removal", false)).toEqual([
      "STUDENT_CANCELLED",
      "LEVEL_COMPLETED",
    ]);
    expect(offeredPolicies("expel", false)).toEqual(["STUDENT_CANCELLED"]);
  });

  it("sends a policy only when it is offered and not the default", () => {
    expect(DEFAULT_DEPARTURE_POLICY).toBe("STUDENT_CANCELLED");
    const admin = offeredPolicies("removal", false);
    expect(departurePolicyPayload("LEVEL_COMPLETED", admin)).toEqual({
      departurePolicy: "LEVEL_COMPLETED",
    });
    expect(departurePolicyPayload("QUALITY_CLAIM", admin)).toEqual({});
    expect(departurePolicyPayload("STUDENT_CANCELLED", admin)).toEqual({});
    expect(
      departurePolicyPayload("QUALITY_CLAIM", offeredPolicies("removal", true)),
    ).toEqual({ departurePolicy: "QUALITY_CLAIM" });
  });
});

// The helpers take the page's `t` as an optional last argument; a marker `t`
// shows every piece of text goes through it, and the data never does.
describe("departure wording in another language", () => {
  const marked = (source: string, params?: Record<string, string | number>) =>
    `[${interpolate(source, params)}]`;

  it("passes the month name, the unit and the sentence through t", () => {
    const f = factsLine(month(), marked);
    expect(plain(f.lead)).toBe(
      "[[Oktabr]: 13 dars, 1 040 000 [so'm]. Bugun 14.10, o'tgani:]",
    );
    expect(f.held).toBe("[6 ta (46%)]");
  });

  it("opens the sentence with a capital month name, even when the language writes it small", () => {
    const small = (source: string, params?: Record<string, string | number>) =>
      interpolate(source === "Oktabr" ? "oktyabr" : source, params);
    expect(factsLine(month(), small).lead.startsWith("Oktyabr: ")).toBe(true);
  });

  it("passes the policy title and every hint through t", () => {
    expect(policyTitle("LEVEL_COMPLETED", marked)).toBe("[Darajani tugatdi]");
    expect(policyTitle("QUALITY_CLAIM")).toBe("Sifat bo'yicha shikoyat");
    expect(policyHint("QUALITY_CLAIM", month(), marked)).toBe(
      "[Oyning to'liq puli qaytadi]",
    );
    expect(policyHint("STUDENT_CANCELLED", month(), marked)).toBe(
      "[13 darsdan 6 tasi o'tgan (40% dan ko'p) — pul qaytmaydi]",
    );
  });

  it("passes the consequence head and line through t, the amounts too", () => {
    const c = departureConsequence(preview(), "QUALITY_CLAIM", marked)!;
    expect(plain(c.head)).toBe("[Oyning to'liq puli qaytadi: 1 040 000 [so'm]]");
    expect(plain(c.line)).toContain("[Balans: 0 → 1 040 000 [so'm].]");
    expect(c.line).toContain("[Naqd pulni keyin «Pul qaytarish» orqali berasiz.]");
    expect(c.line).toContain("[Ustoz oyligi kamaymaydi, farqni markaz qoplaydi.]");

    const kept = departureConsequence(preview(), "STUDENT_CANCELLED", marked)!;
    expect(kept.head).toBe("[Pul qaytmaydi]");
    expect(kept.line).toBe("[Oy darslarining 46% o'tgan.] [Balans o'zgarmaydi.]");
  });

  it("leaves the server's «Dars bo'ldimi?» sentence as it came", () => {
    const text = "Avval «Dars bo'ldimi?» savoliga javob bering: 05.10 (#014).";
    const c = departureConsequence(
      preview({}, month({ trialAwaitsAnswer: text })),
      "STUDENT_CANCELLED",
      marked,
    )!;
    expect(c.head).toBe(text);
  });
});

describe("withheldWarning (removal looks like a move)", () => {
  it("warns with the amount that would have come back", () => {
    const w = withheldWarning(preview(), {})!;
    expect(w.tone).toBe("warning");
    expect(plain(w.title)).toBe(
      "Oy to'lovi qaytarilmaydi — 560 000 so'm ushlab qolinadi",
    );
    expect(w.body).toContain("Oyning 46% i o'tgan (shartnoma 6.2: 40% dan ko'p)");
    expect(w.body).toContain("Guruhni o'zgartirish");
  });

  it("is null when nothing is withheld, or no monthly row", () => {
    const free = month({
      outcomes: {
        ...month().outcomes,
        STUDENT_CANCELLED: { lessons: 7, amount: 560000, withheld: false },
      },
    });
    expect(withheldWarning(preview({}, free), {})).toBeNull();
    expect(withheldWarning(preview({}, null), {})).toBeNull();
    expect(withheldWarning(undefined, {})).toBeNull();
  });

  it("says the money comes back when the reason reads like a move", () => {
    const w = withheldWarning(preview(), { looksLikeMove: true })!;
    expect(w.tone).toBe("success");
    expect(plain(w.title)).toBe("Ko'chish sifatida hisoblanadi — 560 000 so'm balansga qaytadi");
    expect(w.body).toContain("balansiga qaytariladi");
  });

  it("sums the withheld rows and leaves the amount out when it is zero", () => {
    const second = {
      ...preview().enrollments[0],
      enrollmentId: "enr-2",
      groupName: "B1",
    };
    const two = preview({ enrollments: [preview().enrollments[0], second] });
    expect(plain(withheldWarning(two, {})!.title)).toContain("1 120 000 so'm");
    const zero = month({
      outcomes: {
        ...month().outcomes,
        CENTER_INITIATIVE: { lessons: 0, amount: 0, withheld: false },
      },
    });
    expect(withheldWarning(preview({}, zero), {})!.title).toBe(
      "Oy to'lovi qaytarilmaydi",
    );
  });
});
