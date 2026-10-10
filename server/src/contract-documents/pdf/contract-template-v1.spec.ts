import { readFileSync } from 'fs';
import { join } from 'path';
import * as T from './contract-template-v1';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// The plain text of the 02.10.2026 Word file (docs/tolov-savollari).
const reference = readFileSync(
  join(
    __dirname,
    '../../../../docs/tolov-savollari/shartnoma-2026-yakuniy.txt',
  ),
  'utf8',
)
  .split('\n')
  .map(norm)
  .filter(Boolean);
const lines = new Set(reference);

describe('contract template v1', () => {
  it('copies every static paragraph of the 02.10 text word for word', () => {
    const statics = [
      T.TITLE,
      T.PREAMBLE,
      T.MINOR_NOTE,
      T.SECTION_1_TITLE,
      T.EXECUTOR_TITLE,
      T.CUSTOMER_TITLE,
      T.STUDENT_TITLE,
      T.SECTION_2_TITLE,
      T.SECTION_2_INTRO,
      ...T.SECTION_2_TAIL,
      ...T.BODY_SECTIONS.flatMap((s) => [s.title, ...s.items]),
      T.SECTION_11_TITLE,
      T.MARKETING_TITLE,
      T.MARKETING_NOTE,
    ];
    expect(statics.map(norm).filter((s) => !lines.has(s))).toEqual([]);
  });

  it('drops no clause of the reference', () => {
    const clauses = reference.filter(
      (l) => /^(\d+\.\d+\.|— )/.test(l) && !l.includes(' | '),
    );
    const ours = new Set(
      [
        T.SECTION_2_INTRO,
        ...T.SECTION_2_TAIL,
        ...T.BODY_SECTIONS.flatMap((s) => s.items),
      ].map(norm),
    );
    expect(clauses.filter((l) => !ours.has(l))).toEqual([]);
  });

  it('takes the fixed table texts from the reference', () => {
    expect(lines.has(norm(`Tashkilot nomi | ${T.COMPANY_NAME}`))).toBe(true);
    expect(lines.has(norm(`STIR | ${T.COMPANY_TIN}`))).toBe(true);
    expect(lines.has(norm(`Litsenziya | ${T.COMPANY_LICENSE}`))).toBe(true);
    expect(
      lines.has(norm(`Keyingi to'lovlar muddati | ${T.NEXT_PAYMENTS}`)),
    ).toBe(true);
    expect(lines.has(norm(T.LICENSE_LINE.join(' | ')))).toBe(true);
    const requisites = reference.find((l) =>
      l.startsWith('«Daf Sprachzentrum» MCHJ / Yuridik manzil'),
    );
    for (const line of T.EXECUTOR_LINES) {
      expect(requisites).toContain(norm(line));
    }
    for (const label of [...T.MARKETING_ROWS, T.MARKETING_SIGN_LABEL]) {
      expect(reference.some((l) => l.startsWith(`${label} |`))).toBe(true);
    }
  });

  it('sends disputes to the Namangan court for every branch', () => {
    const disputes = T.BODY_SECTIONS.find((s) => s.title.startsWith('9.'));
    expect(disputes?.items.join(' ')).toContain(
      'Namangan shahar fuqarolik ishlari sudida',
    );
  });
});
