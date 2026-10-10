import type { ContractFields } from '../contract-fields';
import {
  contractDocDefinition,
  dmy,
  formatPhone,
  headerDate,
  kindLine,
  noBreakHyphens,
  renderContractPdf,
  som,
  type ContractPdfInput,
} from './contract-pdf';

const course = {
  enrollmentId: 'e-1',
  courseName: 'Standart',
  level: 'A1',
  groupName: '#032',
  teachers: ['Karimova Aziza'],
  startDate: '2026-09-14',
  days: ['monday', 'wednesday', 'friday'],
  lessonStartTime: '14:00',
  lessonEndTime: '15:30',
  lessonsPerWeek: 3,
  lessonMinutes: 90,
  monthlyPrice: 450_000,
  discountPercent: 10,
  firstPaymentAmount: 405_000,
  firstPaymentDate: '2026-10-12',
  discountReason: "Aka-uka o'qiydi",
  discountFrom: null,
  discountTo: null,
  includes: ['DARSLIK' as const],
};

const fields = (over: Partial<ContractFields> = {}): ContractFields => ({
  branch: {
    name: 'Namangan filiali',
    city: 'Namangan',
    address: "Istiqlol ko'chasi, 48",
    representativeName: 'Karimov Anvar',
    representativePosition: 'Direktor',
  },
  student: {
    fullName: 'Soliyev Ahror',
    birthDate: '2010-05-05',
    isMinor: true,
  },
  customer: {
    kind: 'PARENT',
    kindOther: null,
    fullName: 'Soliyeva Malika',
    birthDate: null,
    passport: null,
    address: null,
    phone: '901234567',
    telegram: '@malika',
    email: null,
  },
  courses: [course],
  ...over,
});

const input = (over: Partial<ContractPdfInput> = {}): ContractPdfInput => ({
  number: 'DAF-2026-00001',
  contractDate: '2026-10-10',
  cancelled: false,
  templateVersion: 1,
  fields: fields(),
  ...over,
});

const text = (node: unknown) => JSON.stringify(node);

describe('contract pdf helpers', () => {
  it('formats days, money and phones the Uzbek way', () => {
    expect(dmy('2026-10-10')).toBe('10.10.2026');
    expect(headerDate('2026-10-10')).toBe('«10» oktabr 2026 yil');
    expect(som(1_500_000)).toBe("1 500 000 so'm");
    expect(formatPhone('901234567')).toBe('+998 90 123 45 67');
  });

  it('keeps hyphenated words whole in justified text', () => {
    expect(
      noBreakHyphens('6.2-band, 2-darsigacha, ota-ona, 703–711-moddalari — 18'),
    ).toBe('6.2‑band, 2‑darsigacha, ota‑ona, 703–711‑moddalari — 18');
    const doc = text(contractDocDefinition(input()).content);
    expect(doc).toContain('shu oyning 2‑darsigacha');
    expect(doc).not.toContain('2-darsigacha (birinchi');
  });

  it('ticks the chosen representation basis', () => {
    expect(kindLine(fields().customer)).toBe(
      "□ o'zi   ■ ota-ona   □ vasiy / homiy   □ boshqa: _________",
    );
  });
});

describe('contractDocDefinition', () => {
  it('fills the header, parties and the course table', () => {
    const doc = text(contractDocDefinition(input()).content);
    expect(doc).toContain('№ DAF-2026-00001');
    expect(doc).toContain('Namangan shahri');
    expect(doc).toContain('«10» oktabr 2026 yil');
    expect(doc).toContain('Karimov Anvar / Direktor');
    expect(doc).toContain('Soliyeva Malika');
    expect(doc).toContain('+998 90 123 45 67 / @malika');
    expect(doc).toContain('■ voyaga yetmagan (18 yoshdan kichik)');
    expect(doc).toContain('Nemis tili, A1');
    expect(doc).toContain('#032 / Karimova Aziza');
    expect(doc).toContain(
      'Kunlar: Dushanba, Chorshanba, Juma   Vaqt: 14:00–15:30',
    );
    expect(doc).toContain("450 000 so'm");
    expect(doc).toContain("10 %   |   Sababi: Aka-uka o'qiydi");
    expect(doc).toContain("405 000 so'm   |   To'lov sanasi: 12.10.2026");
    expect(doc).toContain(
      '■ Darslik   □ Materiallar   □ Ichki test   □ Sertifikat',
    );
    expect(doc).toContain('Namangan shahar fuqarolik ishlari sudida');
  });

  it('leaves a line where the admin typed nothing', () => {
    const doc = text(contractDocDefinition(input()).content);
    expect(doc).toContain('Pasport / ID seriya, raqami');
    expect(doc).toContain('____________________');
  });

  it('numbers the courses when there are several', () => {
    const doc = text(
      contractDocDefinition(
        input({
          fields: fields({
            courses: [course, { ...course, enrollmentId: 'e-2' }],
          }),
        }),
      ).content,
    );
    expect(doc).toContain('1-kurs');
    expect(doc).toContain('2-kurs');
  });

  it('marks a cancelled contract on every page', () => {
    const live = contractDocDefinition(input());
    expect(live.background).toBeUndefined();
    const cancelled = contractDocDefinition(input({ cancelled: true }));
    const bg = (
      cancelled.background as (
        page: number,
        size: { width: number; height: number },
      ) => unknown
    )(1, { width: 595, height: 842 });
    expect(text(bg)).toContain('BEKOR QILINGAN');
  });

  it('refuses a text version it does not know', () => {
    expect(() =>
      contractDocDefinition(input({ templateVersion: 2 })),
    ).toThrow();
  });

  it('renders a real PDF', async () => {
    const buf = await renderContractPdf(input());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
