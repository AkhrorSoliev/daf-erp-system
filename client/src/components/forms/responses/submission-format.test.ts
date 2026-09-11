import { describe, expect, it } from "vitest";
import {
  answerText,
  buildSubmissionsCsv,
  csvCell,
  displayName,
  formatSubmittedAt,
  submissionsCsvFileName,
  telHref,
  withCalled,
} from "./submission-format";
import type { SubmissionLead, SubmissionRow, SubmissionsResponse } from "./types";

function row(over: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "s1",
    submittedAt: new Date(2026, 8, 10, 14, 5).toISOString(),
    data: {},
    stage: "awaiting",
    isRepeat: false,
    submitted: { firstName: "Ali", lastName: "Valiyev", phone: "901234567" },
    lead: {
      id: "l1",
      firstName: "Ali",
      lastName: "Valiyev",
      phone: "901234567",
      statusEnum: "NEW",
      archived: false,
      calledAt: null,
      calledBy: null,
      convertedStudentId: null,
      lostReason: null,
      source: { id: "ig", name: "Instagram" },
    },
    ...over,
  };
}

const baseLead = row().lead as SubmissionLead;

function response(rows: SubmissionRow[]): SubmissionsResponse {
  return {
    data: rows,
    total: rows.length,
    page: 1,
    pageSize: 10,
    counts: {
      stages: { awaiting: 1, contacted: 0, converted: 0, lost: 0 },
      sources: [],
    },
    fields: [],
    legacyFields: [],
  };
}

describe("formatSubmittedAt", () => {
  const now = new Date(2026, 8, 11, 18, 0);
  it("bugun", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 11, 14, 5).toISOString(), now)).toBe("Bugun, 14:05");
  });
  it("kecha", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 10, 9, 30).toISOString(), now)).toBe("Kecha, 09:30");
  });
  it("undan oldin", () => {
    expect(formatSubmittedAt(new Date(2026, 8, 1, 8, 0).toISOString(), now)).toBe("01.09.2026, 08:00");
  });
});

describe("telHref", () => {
  it("9 raqamga +998 qo'shadi", () => {
    expect(telHref("901234567")).toBe("tel:+998901234567");
  });
  it("chet el raqamini o'zgartirmaydi", () => {
    expect(telHref("79161234567")).toBe("tel:+79161234567");
  });
});

describe("displayName", () => {
  it("lid bo'lsa lid ismi", () => {
    expect(displayName(row({ lead: { ...baseLead, firstName: "Olim" } }))).toBe("Olim Valiyev");
  });
  it("lid o'chirilgan bo'lsa formadagi ism", () => {
    expect(displayName(row({ lead: null }))).toBe("Ali Valiyev");
  });
});

describe("answerText", () => {
  const select = { id: "lvl", label: "Daraja", options: [{ value: "a1", label: "A1" }] };
  it("variant label'i", () => {
    expect(answerText(select, "a1")).toBe("A1");
  });
  it("checkbox", () => {
    expect(answerText({ id: "c", label: "C" }, true)).toBe("Ha");
    expect(answerText({ id: "c", label: "C" }, false)).toBe("Yo'q");
  });
  it("bo'sh qiymat", () => {
    expect(answerText(select, undefined)).toBe("");
  });
});

describe("withCalled", () => {
  const caller = { id: 10001, firstName: "Aziza", lastName: "K" };
  it("kutmoqda → aloqada, sanoq ko'chadi", () => {
    const next = withCalled(response([row()]), "s1", "2026-09-11T10:00:00Z", caller);
    expect(next.data[0].stage).toBe("contacted");
    expect(next.data[0].lead?.calledBy).toEqual(caller);
    expect(next.counts.stages).toEqual({ awaiting: 0, contacted: 1, converted: 0, lost: 0 });
  });
  it("belgini olib tashlash NEW lidni kutmoqdaga qaytaradi", () => {
    const called = withCalled(response([row()]), "s1", "2026-09-11T10:00:00Z", caller);
    const back = withCalled(called, "s1", null, null);
    expect(back.data[0].stage).toBe("awaiting");
    expect(back.counts.stages.awaiting).toBe(1);
  });
  it("sinovdagi lid belgisiz ham aloqada qoladi", () => {
    const trial = row({ stage: "contacted", lead: { ...baseLead, statusEnum: "TRIAL", calledAt: "2026-09-11T10:00:00Z" } });
    const res = response([trial]);
    res.counts.stages = { awaiting: 0, contacted: 1, converted: 0, lost: 0 };
    const next = withCalled(res, "s1", null, null);
    expect(next.data[0].stage).toBe("contacted");
    expect(next.counts.stages.contacted).toBe(1);
  });
});

describe("csvCell", () => {
  it("vergul va qo'shtirnoqni qochiradi", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("formula bilan boshlangan matnni zararsizlaydi", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
  it("telefon raqamiga tegmaydi", () => {
    expect(csvCell("+998 90 123 45 67")).toBe("+998 90 123 45 67");
  });
});

describe("buildSubmissionsCsv", () => {
  it("BOM, sarlavha, qo'shimcha maydon javobi", () => {
    const csv = buildSubmissionsCsv({
      data: [row({ data: { lvl: "a1" } })],
      fields: [{ id: "lvl", label: "Daraja", options: [{ value: "a1", label: "A1" }] }],
      legacyFields: [],
    });
    const [header, first] = csv.replace("\uFEFF", "").split("\r\n");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(header).toBe("Ism,Familiya,Telefon,Manba,Yuborildi,Bosqich,Qo'ng'iroq qilingan sana,Daraja");
    expect(first).toBe("Ali,Valiyev,+998 90 123 45 67,Instagram,10.09.2026 14:05,Qo'ng'iroq kutmoqda,,A1");
  });
});

describe("submissionsCsvFileName", () => {
  it("nomdan slug yasaydi", () => {
    expect(submissionsCsvFileName("Ro'yxatdan o'tish!", new Date(2026, 8, 11))).toBe(
      "ro-yxatdan-o-tish-javoblar-2026-09-11.csv",
    );
  });
});
