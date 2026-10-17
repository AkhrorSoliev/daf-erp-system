import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DepartedListService, EXCEL_ROW_LIMIT } from './departed-list.service';
import type { DepartedOverviewService } from './departed-overview.service';
import type { DepartureFact } from './departed.types';
import { loadDepartureFacts, type FactSets } from './departure-facts.loader';

jest.mock('./departure-facts.loader', () => ({
  ...jest.requireActual('./departure-facts.loader'),
  loadDepartureFacts: jest.fn(),
}));
const loadFacts = loadDepartureFacts as jest.Mock;

const COMPANY = 1001;
const OCT = { startDate: '2026-10-01', endDate: '2026-10-31' };

const fact = (over: Partial<DepartureFact> & { studentId: number }) =>
  ({
    key: `${over.studentId}:1`,
    fullName: `Talaba ${over.studentId}`,
    phone: '900000000',
    balance: 0,
    startedAt: new Date('2026-10-10T05:00:00Z'),
    stopKind: 'LEFT_GROUP',
    state: 'confirmed',
    returnedAt: null,
    reason: { id: 'r1', name: 'Narx' },
    comment: null,
    studyMonths: 3,
    group: { id: 'g1', name: 'A1-01' },
    course: { id: 'c1', name: 'A1' },
    branch: { id: 1, name: 'Bosh' },
    teachers: [{ id: 30001, fullName: 'Ustoz Bir' }],
    ...over,
  }) as DepartureFact;

const sets = (over: Partial<FactSets> = {}): FactSets => ({
  current: [],
  pendingInRange: [],
  previous: [],
  months: [],
  pendingToday: [],
  startMembers: [],
  floor: null,
  graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
  ...over,
});

const overviewService = {
  overviewWithFacts: jest.fn(),
};

describe('DepartedListService', () => {
  const service = new DepartedListService(
    {} as PrismaService,
    overviewService as unknown as DepartedOverviewService,
  );
  const ids = async (extra: object = {}) =>
    (await service.list(COMPANY, null, { ...OCT, ...extra })).data.map(
      (r) => r.studentId,
    );

  // 1 ketgan, 2 qaytgan, 3 kutilmoqda (pending), 4 ketgan with debt and no reason
  beforeEach(() => {
    loadFacts.mockReset().mockResolvedValue(
      sets({
        current: [
          fact({
            studentId: 1,
            fullName: 'Aziza Rahimova',
            phone: '901112200',
            startedAt: new Date('2026-10-05T05:00:00Z'),
          }),
          fact({
            studentId: 2,
            fullName: 'Olim Karimov',
            phone: '902225566',
            returnedAt: new Date('2026-10-20T05:00:00Z'),
            startedAt: new Date('2026-10-12T05:00:00Z'),
          }),
          fact({
            studentId: 4,
            fullName: 'Zafar Nosirov',
            phone: '907770055',
            balance: -250_000,
            reason: { id: null, name: 'Sabab yozilmagan' },
            startedAt: new Date('2026-10-12T05:00:00Z'),
          }),
        ],
        pendingInRange: [
          fact({
            studentId: 3,
            state: 'pending',
            startedAt: new Date('2026-10-15T05:00:00Z'),
            reason: { id: 'r2', name: 'Vaqt' },
            balance: 40_000,
          }),
        ],
      }),
    );
    overviewService.overviewWithFacts.mockReset();
  });

  it('refuses an empty scope and reads nothing', async () => {
    await expect(service.list(COMPANY, [], OCT)).rejects.toThrow(
      ForbiddenException,
    );
    expect(loadFacts).not.toHaveBeenCalled();
  });

  it('maps the three states and sorts newest departure first, then by id desc', async () => {
    const res = await service.list(COMPANY, null, OCT);
    expect(res.data.map((r) => [r.studentId, r.state])).toEqual([
      [3, 'kutilmoqda'],
      [4, 'ketgan'],
      [2, 'qaytgan'],
      [1, 'ketgan'],
    ]);
    expect(res.data[0].departedAt).toBe('2026-10-15T05:00:00.000Z');
  });

  it('counts confirmed, returned and pending over the whole set, not the page', async () => {
    const res = await service.list(COMPANY, null, { ...OCT, pageSize: 10 });
    expect(res).toMatchObject({
      total: 4,
      confirmed: 3,
      returned: 1,
      pending: 1,
    });
    // a state filter narrows the set the counters read
    const one = await service.list(COMPANY, null, { ...OCT, state: 'qaytgan' });
    expect(one).toMatchObject({
      total: 1,
      confirmed: 1,
      returned: 1,
      pending: 0,
    });
  });

  it('searches by name (case-insensitive part), phone digits and exact id', async () => {
    expect(await ids({ q: 'rahim' })).toEqual([1]);
    expect(await ids({ q: 'OLIM' })).toEqual([2]);
    expect(await ids({ q: '90-777' })).toEqual([4]);
    expect(await ids({ q: '+998 90 777 00 55' })).toEqual([4]);
    expect(await ids({ q: '3' })).toEqual([3]); // the id, no phone holds a 3
    expect(await ids({ q: '4' })).toEqual([4]);
  });

  it('filters by reason, "none" meaning no reason written', async () => {
    expect(await ids({ reasonId: 'none' })).toEqual([4]);
    expect(await ids({ reasonId: 'r2' })).toEqual([3]);
    expect(await ids({ reasonId: 'r1' })).toEqual([2, 1]);
  });

  it('filters by state and by debtors', async () => {
    expect(await ids({ state: 'ketgan' })).toEqual([4, 1]);
    expect(await ids({ state: 'kutilmoqda' })).toEqual([3]);
    expect(await ids({ debtorsOnly: true })).toEqual([4]);
  });

  it("reports the debt as a positive so'm amount, 0 when not negative", async () => {
    const res = await service.list(COMPANY, null, OCT);
    const debt = Object.fromEntries(res.data.map((r) => [r.studentId, r.debt]));
    expect(debt).toEqual({ 1: 0, 2: 0, 3: 0, 4: 250_000 });
  });

  it('pages after filtering; pageSize defaults to 10', async () => {
    const def = await service.list(COMPANY, null, OCT);
    expect(def).toMatchObject({ page: 1, pageSize: 10 });
    loadFacts.mockResolvedValue(
      sets({
        current: Array.from({ length: 12 }, (_, i) =>
          fact({ studentId: 100 + i, startedAt: new Date(2026, 9, 1 + i) }),
        ),
      }),
    );
    const p2 = await service.list(COMPANY, null, { ...OCT, page: 2 });
    expect(p2.total).toBe(12);
    expect(p2.data.map((r) => r.studentId)).toEqual([101, 100]);
  });

  it('applies the course filter to the facts', async () => {
    loadFacts.mockResolvedValue(
      sets({
        current: [
          fact({ studentId: 1 }),
          fact({ studentId: 2, course: { id: 'c2', name: 'B1' } }),
        ],
      }),
    );
    expect(await ids({ courseId: ['c2'] })).toEqual([2]);
  });

  describe('excel', () => {
    const overview = { cards: {} } as never;
    const withFacts = (facts: FactSets) =>
      overviewService.overviewWithFacts.mockResolvedValue({
        overview: {
          range: OCT,
          previous: OCT,
          cards: {
            departed: 0,
            previousDeparted: 0,
            atStart: 0,
            per100: null,
            avgStudyMonths: null,
          },
          pendingToday: 0,
          months: [],
          reasons: [],
          cuts: { teacher: [], course: [], group: [], branch: [] },
          uniqueDeparted: 0,
          teacherChange: {
            totalTeacherChanges: 0,
            departedAfterTeacherChange: 0,
          },
          graceDays: facts.graceDays,
        },
        facts,
      });

    it('names the file by the range and builds a workbook from the filtered rows', async () => {
      withFacts(sets({ current: [fact({ studentId: 1 })] }));
      const out = await service.excel(COMPANY, null, OCT);
      expect(out.filename).toBe('ketgan-oquvchilar-2026-10-01_2026-10-31.xlsx');
      expect(out.buffer.length).toBeGreaterThan(100);
      expect(overviewService.overviewWithFacts).toHaveBeenCalledWith(
        COMPANY,
        null,
        OCT,
        { withTeacherChange: false },
      );
      void overview;
    });

    it('refuses more than 20 000 rows with a 400', async () => {
      withFacts(
        sets({
          current: Array.from({ length: EXCEL_ROW_LIMIT + 1 }, (_, i) =>
            fact({ studentId: i + 1 }),
          ),
        }),
      );
      await expect(service.excel(COMPANY, null, OCT)).rejects.toThrow(
        new BadRequestException(
          'Qatorlar 20 000 dan oshdi — filtrni toraytiring',
        ),
      );
    });
  });
});
