import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AudienceFactsLoader } from './audience-facts.loader';
import { AudienceService } from './audience.service';

const mockLoadDepartures = jest.fn();
const mockDeparturesInRange = jest.fn();
jest.mock('../shared/departures.loader', () => ({
  loadDepartures: (...args: unknown[]) => mockLoadDepartures(...args),
}));
jest.mock('../../students/shared/departure-episodes', () => ({
  departuresInRange: (...args: unknown[]) => mockDeparturesInRange(...args),
}));

describe('AudienceFactsLoader', () => {
  const prisma = { student: { findMany: jest.fn(), count: jest.fn() } };
  let loader: AudienceFactsLoader;

  beforeEach(async () => {
    prisma.student.findMany.mockReset();
    prisma.student.count.mockReset();
    mockLoadDepartures.mockReset();
    mockDeparturesInRange.mockReset();
    const m = await Test.createTestingModule({
      providers: [
        AudienceFactsLoader,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    loader = m.get(AudienceFactsLoader);
  });

  it('reads the studying students of the company, inside the branch scope', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    await loader.load(7, [3, 4]);
    const { where } = prisma.student.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      companyId: 7,
      deletedAt: null,
      status: 'ACTIVE',
      enrollments: { some: expect.anything() },
      branches: { some: { branchId: { in: [3, 4] } } },
    });
  });

  it('adds no branch predicate for a CEO who picked nothing', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    await loader.load(7, null);
    const { where } = prisma.student.findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty('branches');
  });

  it('turns a row into plain facts: Tashkent birth day, scoped branch, live course', async () => {
    prisma.student.findMany.mockResolvedValue([
      {
        gender: 'FEMALE',
        // local midnight in Tashkent = 19:00Z the day before
        dateOfBirth: new Date('2008-03-14T19:00:00.000Z'),
        branches: [
          { branch: { id: 1, name: 'Other' } },
          { branch: { id: 3, name: 'Namangan' } },
        ],
        enrollments: [
          { group: { level: ' A2 ', course: { id: 9, name: 'Standart' } } },
        ],
      },
      {
        gender: null,
        dateOfBirth: null,
        branches: [],
        enrollments: [],
      },
    ]);
    const rows = await loader.load(7, [3]);
    expect(rows[0]).toEqual({
      gender: 'FEMALE',
      birthDate: '2008-03-15',
      branchId: 3,
      branchName: 'Namangan',
      courseId: '9',
      courseName: 'Standart',
      level: 'A2',
    });
    expect(rows[1]).toEqual({
      gender: null,
      birthDate: null,
      branchId: null,
      branchName: null,
      courseId: null,
      courseName: null,
      level: null,
    });
  });

  it('counts everyone in scope except prospects and archived cards', async () => {
    prisma.student.count.mockResolvedValue(1240);
    await expect(loader.countAll(7, [3])).resolves.toBe(1240);
    const { where } = prisma.student.count.mock.calls[0][0];
    expect(where).toMatchObject({
      companyId: 7,
      deletedAt: null,
      status: { notIn: ['PROSPECT', 'ARCHIVED'] },
      branches: { some: { branchId: { in: [3] } } },
    });
  });

  it('places a leaver by the age he had on the day he left and counts those with no birth date', async () => {
    mockLoadDepartures.mockResolvedValue({
      episodes: [],
      floor: null,
    });
    mockDeparturesInRange.mockReturnValue([
      { studentId: 1, startedAt: new Date('2026-03-10T08:00:00.000Z') },
      { studentId: 2, startedAt: new Date('2026-03-10T08:00:00.000Z') },
    ]);
    prisma.student.findMany.mockResolvedValue([
      { id: 1, dateOfBirth: new Date('2008-03-09T19:00:00.000Z') },
      { id: 2, dateOfBirth: null },
    ]);
    const out = await loader.loadDeparted(
      7,
      null,
      new Date('2026-10-25T10:00:00.000Z'),
    );
    // born 2008-03-10 (Tashkent), left 2026-03-10: his 18th birthday that day
    expect(out).toEqual({ ages: [18], ageUnknown: 1 });
  });

  it('reads no students when nobody left', async () => {
    mockLoadDepartures.mockResolvedValue({ episodes: [], floor: null });
    mockDeparturesInRange.mockReturnValue([]);
    const out = await loader.loadDeparted(7, null, new Date());
    expect(out).toEqual({ ages: [], ageUnknown: 0 });
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});

describe('AudienceService', () => {
  const loader = {
    load: jest.fn(),
    countAll: jest.fn(),
    loadDeparted: jest.fn(),
  };
  let service: AudienceService;

  beforeEach(async () => {
    loader.load.mockReset();
    loader.countAll.mockReset().mockResolvedValue(0);
    loader.loadDeparted
      .mockReset()
      .mockResolvedValue({ ages: [], ageUnknown: 0 });
    const m = await Test.createTestingModule({
      providers: [
        AudienceService,
        { provide: AudienceFactsLoader, useValue: loader },
      ],
    }).compile();
    service = m.get(AudienceService);
  });

  it('refuses an empty scope instead of serving zeros', async () => {
    await expect(service.overview(1, [])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('builds the overview from what the loader read', async () => {
    loader.load.mockResolvedValue([
      {
        gender: 'MALE',
        birthDate: '2000-01-01',
        branchId: 1,
        branchName: 'A',
        courseId: 'c',
        courseName: 'C',
        level: 'A1',
      },
    ]);
    loader.countAll.mockResolvedValue(1240);
    loader.loadDeparted.mockResolvedValue({ ages: [18], ageUnknown: 2 });
    const o = await service.overview(1, null);
    expect(o.summary.total).toBe(1);
    expect(o.systemTotal).toBe(1240);
    expect(o.branches).toHaveLength(1);
    expect(o.levels.map((l) => l.name)).toEqual(['A1']);
    expect(o.departuresAgeUnknown).toBe(2);
    expect(loader.load).toHaveBeenCalledWith(1, null);
    expect(loader.countAll).toHaveBeenCalledWith(1, null);
  });
});
