import { LeadStatus, Prisma } from '@prisma/client';
import {
  SUBMISSION_STAGES,
  StageLeadFacts,
  stageWhere,
  submissionStage,
} from './submission-stage';

/**
 * `stageWhere` Prisma'ga ketadi, `submissionStage` xotirada ishlaydi. Ular
 * bir-biriga zid ketsa, chip yonidagi son jadvaldagi qatorlar soniga to'g'ri
 * kelmaydi. Shuning uchun bu yerda `stageWhere` ishlatadigan where'ning kichik
 * to'plami xotirada baholanadi va har bir kombinatsiyada ikkalasi solishtiriladi.
 */
type Row = { leadId: string | null; lead: StageLeadFacts | null };

function matchScalar(cond: unknown, value: unknown): boolean {
  if (cond === null) return value === null;
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  if ('not' in c) return c.not === null ? value !== null : value !== c.not;
  if ('in' in c) return (c.in as unknown[]).includes(value);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
  throw new Error(`qo'llab-quvvatlanmagan filtr: ${JSON.stringify(cond)}`);
}

function matchLead(
  where: Record<string, unknown>,
  lead: StageLeadFacts,
): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as Record<string, unknown>[]).some((w) =>
        matchLead(w, lead),
      );
    }
    return matchScalar(cond, lead[key as keyof StageLeadFacts]);
  });
}

function matches(
  where: Prisma.CustomFormSubmissionWhereInput,
  row: Row,
): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as Prisma.CustomFormSubmissionWhereInput[]).some((w) =>
        matches(w, row),
      );
    }
    if (key === 'leadId') return matchScalar(cond, row.leadId);
    if (key === 'lead') {
      const is = (cond as { is: Record<string, unknown> }).is;
      return row.lead !== null && matchLead(is, row.lead);
    }
    throw new Error(`qo'llab-quvvatlanmagan kalit: ${key}`);
  });
}

const STATUSES = Object.values(LeadStatus);
const SOME_DATE = new Date('2026-09-01T10:00:00Z');

function allRows(): Row[] {
  const rows: Row[] = [{ leadId: null, lead: null }];
  for (const statusEnum of STATUSES) {
    for (const deletedAt of [null, SOME_DATE]) {
      for (const calledAt of [null, SOME_DATE]) {
        rows.push({
          leadId: 'lead-1',
          lead: { statusEnum, deletedAt, calledAt },
        });
      }
    }
  }
  return rows;
}

describe('submission stage', () => {
  it("har bir kombinatsiya aynan bitta bosqichga tushadi va ikkala ta'rif mos keladi", () => {
    for (const row of allRows()) {
      const matched = SUBMISSION_STAGES.filter((s) =>
        matches(stageWhere(s), row),
      );
      expect({ row, matched }).toEqual({
        row,
        matched: [submissionStage(row.lead)],
      });
    }
  });

  it("lid yo'q bo'lsa — yo'qotildi", () => {
    expect(submissionStage(null)).toBe('lost');
  });

  it("o'quvchiga aylangan lid arxivda bo'lsa ham — o'quvchi bo'ldi", () => {
    expect(
      submissionStage({
        statusEnum: 'CONVERTED',
        deletedAt: SOME_DATE,
        calledAt: null,
      }),
    ).toBe('converted');
  });

  it("arxivdagi NEW lid — yo'qotildi, qo'ng'iroq qilingan bo'lsa ham", () => {
    expect(
      submissionStage({
        statusEnum: 'NEW',
        deletedAt: SOME_DATE,
        calledAt: SOME_DATE,
      }),
    ).toBe('lost');
  });

  it("qo'ng'iroq qilingan NEW lid — aloqada", () => {
    expect(
      submissionStage({
        statusEnum: 'NEW',
        deletedAt: null,
        calledAt: SOME_DATE,
      }),
    ).toBe('contacted');
  });

  it("sinovdagi lid qo'ng'iroqsiz ham — aloqada", () => {
    expect(
      submissionStage({ statusEnum: 'TRIAL', deletedAt: null, calledAt: null }),
    ).toBe('contacted');
  });

  it("qo'ng'iroq qilinmagan NEW lid — kutmoqda", () => {
    expect(
      submissionStage({ statusEnum: 'NEW', deletedAt: null, calledAt: null }),
    ).toBe('awaiting');
  });
});
