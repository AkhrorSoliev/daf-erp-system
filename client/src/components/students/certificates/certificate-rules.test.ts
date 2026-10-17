import { describe, expect, it } from "vitest";
import {
  dmy,
  issueClickAction,
  issueMode,
  issuedDay,
  levelSummary,
  needsReissueConfirm,
  percentText,
  REISSUE_CONFIRM_TEXT,
  REISSUE_EXEMPT_NOTICE,
} from "./certificate-rules";
import type { LevelPreview } from "./certificate-types";

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
  thresholds: { attendance: 80, app: 100 },
  verdict: { attendanceOk: true, appOk: true, eligible: true, reasons: [] },
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
      verdict: { attendanceOk: false, appOk: null, eligible: false, reasons: ["Davomat 74%, kerak 80%"] },
    };
    expect(issueMode(weak, true)).toBe("exempt");
    expect(issueMode(weak, false)).toBe("blocked");
  });
});

const given = {
  id: "3f9c2a7e-5b1d-4c8a-9e60-2d7f81a4c0b3",
  number: "TB-2026-0001",
  level: "A1",
  issuedAt: "2026-10-17T07:00:00.000Z",
  exempt: false,
  revoked: false,
};

describe("needsReissueConfirm", () => {
  it("is false for a level with no document and true from the first one on", () => {
    expect(needsReissueConfirm({ issued: [] })).toBe(false);
    expect(needsReissueConfirm({ issued: [given] })).toBe(true);
    expect(needsReissueConfirm({ issued: [given, { ...given, number: "TB-2026-0002" }] })).toBe(true);
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
  it("lists attendance, app, late count, unit tests and mock", () => {
    expect(levelSummary(base)).toEqual([
      { label: "Davomat", value: "91% · 21 / 23 dars", hint: "chegara 80%" },
      { label: "Ilova", value: "100% · 80 / 80 dars", hint: "chegara 100%" },
      { label: "Kech qolgan", value: "2 marta", hint: null },
      { label: "Yakuniy sinovlar", value: "5 / 5", hint: null },
      { label: "Mock imtihon", value: "72 / 100 · 07.10.2026", hint: null },
    ]);
  });

  it("explains a level the app does not cover and leaves empty rows out", () => {
    const b2: LevelPreview = {
      ...base,
      level: "B2",
      app: { applies: false, done: 0, open: 0, percent: null },
      thresholds: { attendance: 80, app: null },
      unitTests: null,
      mock: null,
      attendance: { attended: 10, late: 0, absent: 0, counted: 10, percent: 100 },
    };
    expect(levelSummary(b2)).toEqual([
      { label: "Davomat", value: "100% · 10 / 10 dars", hint: "chegara 80%" },
      { label: "Ilova", value: "shart qo'llanmaydi", hint: null },
      { label: "Kech qolgan", value: "0 marta", hint: null },
    ]);
  });
});
