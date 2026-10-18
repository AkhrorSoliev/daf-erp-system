import { describe, expect, it } from "vitest";
import de from "@/i18n/dictionaries/de";
import ru from "@/i18n/dictionaries/ru";
import { translate, type Params } from "@/i18n/translate";
import { formatBalance } from "@/lib/format-utils";
import {
  canSubmitRevoke,
  dmy,
  issueClickAction,
  issueMode,
  issuedDay,
  levelSummary,
  needsReissueConfirm,
  percentText,
  REISSUE_CONFIRM_TEXT,
  REISSUE_EXEMPT_NOTICE,
  revokeDescription,
  revokedState,
  revokeReasonHint,
  validRevokeReason,
} from "./certificate-rules";
import type { IssuedCertificate, LevelPreview } from "./certificate-types";

const PASSING = {
  attendanceOk: true,
  appOk: true,
  debtOk: true,
  lessonsOk: true,
  lateOk: true,
  latePercent: 10,
  testsOk: true,
  eligible: true,
  reasons: [],
};

const base: LevelPreview = {
  level: "A1",
  groupNames: ["A1-17"],
  courseName: "Deutsch A1",
  lessonMinutes: 90,
  from: "2026-07-07",
  to: "2026-10-15",
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: "2026-10-07" },
  thresholds: { attendance: 80, app: 100, minLessons: 20, maxLatePercent: 20 },
  verdict: PASSING,
  issued: [],
};

describe("dmy", () => {
  it("turns YYYY-MM-DD into dd.MM.yyyy", () => {
    expect(dmy("2026-10-07")).toBe("07.10.2026");
  });
});

describe("issuedDay", () => {
  it("is the Tashkent day of the instant, the day the PDF and the QR page print", () => {
    // 01:30 on 18.10 in Tashkent is still 17.10 in UTC: the UTC slice gave the wrong day.
    expect(issuedDay("2026-10-17T20:30:00.000Z")).toBe("18.10.2026");
    expect(issuedDay("2026-10-17T07:00:00.000Z")).toBe("17.10.2026");
    // Tashkent midnight is 19:00 UTC the evening before.
    expect(issuedDay("2026-10-17T19:00:00.000Z")).toBe("18.10.2026");
    expect(issuedDay("2026-10-17T18:59:59.000Z")).toBe("17.10.2026");
  });
});

describe("percentText", () => {
  it("prints a percent or a dash", () => {
    expect(percentText(91)).toBe("91%");
    expect(percentText(null)).toBe("—");
  });
});

describe("issueMode", () => {
  it("is normal when the student qualifies, for everyone", () => {
    expect(issueMode(base, false)).toBe("normal");
    expect(issueMode(base, true)).toBe("normal");
  });
  it("is exempt for the CEO and blocked for anyone else when the student does not qualify", () => {
    const weak: LevelPreview = {
      ...base,
      verdict: { ...PASSING, attendanceOk: false, appOk: null, eligible: false, reasons: ["Davomat 74%, kerak 80%"] },
    };
    expect(issueMode(weak, true)).toBe("exempt");
    expect(issueMode(weak, false)).toBe("blocked");
  });
});

const given: IssuedCertificate = {
  id: "3f9c2a7e-5b1d-4c8a-9e60-2d7f81a4c0b3",
  number: "TB-2026-0001",
  level: "A1",
  issuedAt: "2026-10-17T07:00:00.000Z",
  exempt: false,
  revoked: false,
  revokedAt: null,
  revokedReason: null,
};
const cancelled: IssuedCertificate = {
  ...given,
  number: "TB-2026-0003",
  revoked: true,
  revokedAt: "2026-10-18T07:00:00.000Z",
  revokedReason: "Noto'g'ri o'quvchiga berilgan",
};

describe("needsReissueConfirm", () => {
  it("is false for a level with no document and true from the first one on", () => {
    expect(needsReissueConfirm({ issued: [] })).toBe(false);
    expect(needsReissueConfirm({ issued: [given] })).toBe(true);
    expect(needsReissueConfirm({ issued: [given, { ...given, number: "TB-2026-0002" }] })).toBe(true);
  });

  // A cancelled document no longer stands: re-issuing after a mistake must not ask «another one?».
  it("counts only documents that were not cancelled", () => {
    expect(needsReissueConfirm({ issued: [cancelled] })).toBe(false);
    expect(needsReissueConfirm({ issued: [cancelled, cancelled] })).toBe(false);
    expect(needsReissueConfirm({ issued: [cancelled, given] })).toBe(true);
  });

  it("issues at once after the only document was cancelled", () => {
    expect(issueClickAction({ issued: [cancelled] }, "normal")).toBe("issue");
  });
});

describe("validRevokeReason", () => {
  it("wants 3 to 500 characters after trimming", () => {
    expect(validRevokeReason("")).toBe(false);
    expect(validRevokeReason("   ")).toBe(false);
    expect(validRevokeReason("ab")).toBe(false);
    expect(validRevokeReason("  ab  ")).toBe(false);
    expect(validRevokeReason("abc")).toBe(true);
    expect(validRevokeReason("  abc  ")).toBe(true);
    expect(validRevokeReason("a".repeat(500))).toBe(true);
    expect(validRevokeReason("a".repeat(501))).toBe(false);
  });
});

describe("canSubmitRevoke", () => {
  it("needs a valid reason and no request in flight", () => {
    expect(canSubmitRevoke("Xato berilgan", false)).toBe(true);
    expect(canSubmitRevoke("Xato berilgan", true)).toBe(false);
    expect(canSubmitRevoke("ab", false)).toBe(false);
    expect(canSubmitRevoke("", false)).toBe(false);
  });
});

describe("revokeReasonHint", () => {
  it("says nothing before typing and while the reason is fine, and asks for more when too short", () => {
    expect(revokeReasonHint("")).toBeNull();
    expect(revokeReasonHint("   ")).toBeNull();
    expect(revokeReasonHint("ab")).toBe("Sabab kamida 3 belgidan iborat bo'lsin");
    expect(revokeReasonHint("abc")).toBeNull();
  });
});

describe("revokeDescription", () => {
  it("is the owner's words with the document's number", () => {
    expect(revokeDescription("TB-2026-0007")).toBe(
      "TB-2026-0007 raqamli hujjat bekor qilinadi. QR sahifa «bekor qilingan» deb ko'rsatadi, PDF endi berilmaydi, raqam qayta berilmaydi. Buni qaytarib bo'lmaydi.",
    );
  });
});

describe("revokedState", () => {
  it("is null for a document that stands", () => {
    expect(revokedState(given)).toBeNull();
  });

  it("gives the pill, the Tashkent day and the reason line of a cancelled one", () => {
    expect(revokedState(cancelled)).toEqual({
      pill: "Bekor qilingan",
      day: "18.10.2026",
      reasonLine: "Sabab: Noto'g'ri o'quvchiga berilgan",
    });
  });

  it("copes with a cancelled row that carries no reason or day", () => {
    expect(revokedState({ ...cancelled, revokedAt: null, revokedReason: null })).toEqual({
      pill: "Bekor qilingan",
      day: null,
      reasonLine: null,
    });
    expect(revokedState({ ...cancelled, revokedReason: "  " })?.reasonLine).toBeNull();
  });
});

describe("issueClickAction", () => {
  it("issues at once when the level has no document yet", () => {
    expect(issueClickAction({ issued: [] }, "normal")).toBe("issue");
  });
  it("asks first when the level already has a document", () => {
    expect(issueClickAction({ issued: [given] }, "normal")).toBe("confirm");
  });
  it("keeps the CEO exemption on its own reason dialog, with or without an earlier document", () => {
    expect(issueClickAction({ issued: [] }, "exempt")).toBe("exempt");
    expect(issueClickAction({ issued: [given] }, "exempt")).toBe("exempt");
  });
});

describe("the reissue texts", () => {
  it("are the owner's words", () => {
    expect(REISSUE_CONFIRM_TEXT).toBe(
      "Bu daraja uchun hujjat allaqachon berilgan. Yangi raqamli yana bittasini berasizmi?",
    );
    expect(REISSUE_EXEMPT_NOTICE).toBe("Bu daraja uchun hujjat allaqachon berilgan. Yangisiga yangi raqam beriladi.");
  });
});

describe("levelSummary", () => {
  it("lists attendance, lessons, lateness, app, final tests, debt and mock", () => {
    expect(levelSummary(base, 0)).toEqual([
      { label: "Davomat", value: "91% · 21 / 23 dars", hint: "chegara 80%" },
      { label: "Darslar soni", value: "23 ta", hint: "kamida 20 ta" },
      { label: "Kech qolgan", value: "2 / 21 dars (10%)", hint: "chegara 20%" },
      { label: "Ilova", value: "100% · 80 / 80 dars", hint: "chegara 100%" },
      { label: "Yakuniy sinovlar", value: "5 / 5", hint: "hammasi kerak" },
      { label: "Qarz", value: "yo'q", hint: null },
      { label: "Mock imtihon", value: "72 / 100 · 07.10.2026", hint: null },
    ]);
  });

  it("explains a level the app does not cover and leaves empty rows out", () => {
    const b2: LevelPreview = {
      ...base,
      level: "B2",
      app: { applies: false, done: 0, open: 0, percent: null },
      thresholds: { attendance: 80, app: null, minLessons: 20, maxLatePercent: 20 },
      unitTests: null,
      mock: null,
      attendance: { attended: 10, late: 0, absent: 0, counted: 10, percent: 100 },
      verdict: { ...PASSING, latePercent: 0 },
    };
    expect(levelSummary(b2, 0)).toEqual([
      { label: "Davomat", value: "100% · 10 / 10 dars", hint: "chegara 80%" },
      { label: "Darslar soni", value: "10 ta", hint: "kamida 20 ta" },
      { label: "Kech qolgan", value: "0 / 10 dars (0%)", hint: "chegara 20%" },
      { label: "Ilova", value: "shart qo'llanmaydi", hint: null },
      { label: "Qarz", value: "yo'q", hint: null },
    ]);
  });

  it("writes the debt the server sent, in so'm, and says nothing is owed for zero or a credit", () => {
    const debt = levelSummary(base, -250000).find((l) => l.label === "Qarz");
    expect(debt).toEqual({ label: "Qarz", value: formatBalance(250000), hint: null });
    expect(levelSummary(base, 120000).find((l) => l.label === "Qarz")?.value).toBe("yo'q");
  });

  it("prints the lateness percent as the server computed it, and a dash when none attended", () => {
    const late: LevelPreview = {
      ...base,
      attendance: { attended: 19, late: 4, absent: 0, counted: 19, percent: 100 },
      verdict: { ...PASSING, lateOk: false, latePercent: 22, eligible: false },
    };
    expect(levelSummary(late, 0).find((l) => l.label === "Kech qolgan")).toEqual({
      label: "Kech qolgan",
      value: "4 / 19 dars (22%)",
      hint: "chegara 20%",
    });
    const none: LevelPreview = {
      ...base,
      attendance: { attended: 0, late: 0, absent: 3, counted: 3, percent: 0 },
      verdict: { ...PASSING, latePercent: null },
    };
    expect(levelSummary(none, 0).find((l) => l.label === "Kech qolgan")?.value).toBe("0 / 0 dars (—)");
  });

  it("takes the thresholds from the server, not from a constant", () => {
    const custom: LevelPreview = { ...base, thresholds: { ...base.thresholds, minLessons: 30, maxLatePercent: 5 } };
    const lines = levelSummary(custom, 0);
    expect(lines.find((l) => l.label === "Darslar soni")?.hint).toBe("kamida 30 ta");
    expect(lines.find((l) => l.label === "Kech qolgan")?.hint).toBe("chegara 5%");
  });

  it("shows a final-tests line only when the level has some", () => {
    expect(levelSummary({ ...base, unitTests: null }, 0).some((l) => l.label === "Yakuniy sinovlar")).toBe(false);
  });
});

describe("the texts in another language", () => {
  const tRu = (source: string, params?: Params) => translate("ru", ru, source, params);
  const tDe = (source: string, params?: Params) => translate("de", de, source, params);

  it("draws the summary lines in the page language, with the server's figures untouched", () => {
    expect(levelSummary(base, -250000, tRu)).toEqual([
      { label: "Посещаемость", value: "91% · 21/23 зан.", hint: "порог 80%" },
      { label: "Количество занятий", value: "23", hint: "минимум 20" },
      { label: "Опоздания", value: "2 из 21 зан. (10%)", hint: "порог 20%" },
      { label: "Приложение", value: "100% · 80/80 зан.", hint: "порог 100%" },
      { label: "Итоговые тесты", value: "5 / 5", hint: "нужны все" },
      { label: "Долг", value: formatBalance(250000, "сум"), hint: null },
      { label: "Пробный экзамен", value: "72 / 100 · 07.10.2026", hint: null },
    ]);
    expect(levelSummary(base, 0, tDe).find((l) => l.label === "Schulden")?.value).toBe("keine");
  });

  it("translates the reason hint, the cancel texts and the pill but never the typed reason", () => {
    expect(revokeReasonHint("ab", tRu)).toBe("Причина должна содержать не менее 3 символов");
    expect(revokeDescription("TB-2026-0007", tRu)).toContain("Документ TB-2026-0007 будет отменён");
    // The public QR page prints «bekor qilingan» in Uzbek: every language keeps those words.
    for (const t of [tRu, tDe]) expect(revokeDescription("TB-2026-0007", t)).toContain("«bekor qilingan»");
    expect(revokedState(cancelled, tRu)).toEqual({
      pill: "Отменено",
      day: "18.10.2026",
      reasonLine: "Причина: Noto'g'ri o'quvchiga berilgan",
    });
  });

  it("translates the owner's reissue texts through the constants", () => {
    expect(tRu(REISSUE_CONFIRM_TEXT)).toBe("Для этого уровня документ уже выдан. Выдать ещё один, с новым номером?");
    expect(tDe(REISSUE_EXEMPT_NOTICE)).toContain("neue Nummer");
  });
});
