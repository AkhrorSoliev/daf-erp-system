import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPARTURE_POLICY,
  departureConsequence,
  departurePolicyPayload,
  factsLine,
  lessonChips,
  monthlyRows,
  policyHint,
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

  it("sends a policy only when it was chosen by someone who may choose it", () => {
    expect(DEFAULT_DEPARTURE_POLICY).toBe("STUDENT_CANCELLED");
    expect(departurePolicyPayload("QUALITY_CLAIM", true)).toEqual({
      departurePolicy: "QUALITY_CLAIM",
    });
    expect(departurePolicyPayload("STUDENT_CANCELLED", true)).toEqual({});
    expect(departurePolicyPayload("QUALITY_CLAIM", false)).toEqual({});
  });
});
