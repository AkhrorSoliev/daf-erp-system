import { Test, TestingModule } from '@nestjs/testing';
import { SalaryType } from '@prisma/client';
import { SalaryStaffConfigService } from './salary-staff-config.service';
import { PrismaService } from '../prisma/prisma.service';

const CEO = {
  mainBranch: null,
  roles: [{ role: { name: 'CEO' } }],
};
const DIRECTOR_B7 = {
  mainBranch: 7,
  roles: [{ role: { name: 'Branch Director' } }],
};
const DIRECTOR_NO_BRANCH = {
  mainBranch: null,
  roles: [{ role: { name: 'Branch Director' } }],
};

const admin = {
  id: 10030,
  firstName: 'Nodirabegim',
  lastName: 'Raimova',
  isActive: true,
  status: 'ACTIVE',
  roles: [{ role: { id: 3, name: 'Administrator' } }],
  branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
};

const cleaner = {
  id: 10500,
  firstName: 'Zulfiya',
  lastName: 'Karimova',
  isActive: true,
  status: 'ACTIVE',
  position: 'Farrosh',
  roles: [],
  branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
};

describe('SalaryStaffConfigService', () => {
  let service: SalaryStaffConfigService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(CEO),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryStaffConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryStaffConfigService);
  });

  /** The `where` the staff list was built from. */
  const userWhere = () => prisma.user.findMany.mock.calls[0][0].where;

  it('excludes Teacher AND Student accounts', async () => {
    await service.listStaff({}, 1, 10000);
    expect(userWhere().roles).toEqual({
      none: { role: { name: { in: ['Teacher', 'Student'] } } },
    });
  });

  it('excludes archived users and scopes to the company', async () => {
    await service.listStaff({}, 1, 10000);
    expect(userWhere()).toEqual(
      expect.objectContaining({ deletedAt: null, companyId: 1 }),
    );
  });

  it('lets a CEO with no branch picked see every branch', async () => {
    await service.listStaff({}, 1, 10000);
    expect(userWhere().branches).toBeUndefined();
  });

  it('narrows to the branch a CEO picked in the header', async () => {
    await service.listStaff({ branchId: 7 }, 1, 10000);
    expect(userWhere().branches).toEqual({ some: { branchId: 7 } });
  });

  it("confines a Branch Director to their own branch", async () => {
    prisma.user.findUnique.mockResolvedValue(DIRECTOR_B7);
    await service.listStaff({}, 1, 10500);
    expect(userWhere().branches).toEqual({ some: { branchId: 7 } });
  });

  it('refuses a Branch Director asking for another branch — no query, empty list', async () => {
    prisma.user.findUnique.mockResolvedValue(DIRECTOR_B7);
    const res = await service.listStaff({ branchId: 9 }, 1, 10500);
    expect(res.data).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when a confined caller has no branch at all', async () => {
    prisma.user.findUnique.mockResolvedValue(DIRECTOR_NO_BRANCH);
    const res = await service.listStaff({}, 1, 10500);
    expect(res.data).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('searches by name and by numeric id', async () => {
    await service.listStaff({ search: '10030' }, 1, 10000);
    expect(userWhere().OR).toEqual([
      { firstName: { contains: '10030', mode: 'insensitive' } },
      { lastName: { contains: '10030', mode: 'insensitive' } },
      { id: 10030 },
    ]);
  });

  it('omits the id clause when the search is not numeric', async () => {
    await service.listStaff({ search: 'Nodira' }, 1, 10000);
    expect(userWhere().OR).toHaveLength(2);
  });

  it('returns a rate-less staff member with an empty configs array', async () => {
    prisma.user.findMany.mockResolvedValue([admin]);
    const res = await service.listStaff({}, 1, 10000);
    expect(res.data).toEqual([
      {
        user: {
          id: 10030,
          firstName: 'Nodirabegim',
          lastName: 'Raimova',
          roles: [{ id: 3, name: 'Administrator' }],
          isActive: true,
          branch: { id: 7, name: "Farg'ona filiali" },
        },
        configs: [],
      },
    ]);
  });

  it('attaches the active fixed-monthly config to its owner', async () => {
    prisma.user.findMany.mockResolvedValue([admin]);
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        id: 'cfg1',
        userId: 10030,
        salaryType: SalaryType.FIXED_MONTHLY,
        value: 4_000_000,
        groupId: null,
        group: null,
      },
    ]);
    const res = await service.listStaff({}, 1, 10000);
    expect(res.data[0].configs).toEqual([
      {
        id: 'cfg1',
        salaryType: SalaryType.FIXED_MONTHLY,
        value: 4_000_000,
        groupId: null,
        group: null,
      },
    ]);
  });

  it('reads only ACTIVE configs of the listed staff', async () => {
    prisma.user.findMany.mockResolvedValue([admin]);
    await service.listStaff({}, 1, 10000);
    expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: [10030] }, isActive: true, companyId: 1 },
      }),
    );
  });

  it('skips the config query entirely when no staff matched', async () => {
    const res = await service.listStaff({}, 1, 10000);
    expect(res.data).toEqual([]);
    expect(prisma.employeeSalaryConfig.findMany).not.toHaveBeenCalled();
  });

  it('sorts configured staff after nobody — rate-less first, then by name', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...admin, id: 10031, firstName: 'Bekzod', lastName: 'A' },
      { ...admin, id: 10030, firstName: 'Alisher', lastName: 'B' },
    ]);
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        id: 'cfg1',
        userId: 10030,
        salaryType: SalaryType.FIXED_MONTHLY,
        value: 1,
        groupId: null,
        group: null,
      },
    ]);
    const res = await service.listStaff({}, 1, 10000);
    // Bekzod has no rate → he is the actionable one, so he leads.
    expect(res.data.map((r) => r.user.id)).toEqual([10031, 10030]);
  });

  it('rolsiz xodimni lavozimi bilan qaytaradi', async () => {
    prisma.user.findMany.mockResolvedValue([cleaner]);

    const { data } = await service.listStaff({}, 1001, 1);

    expect(data).toHaveLength(1);
    expect(data[0].user.position).toBe('Farrosh');
    expect(data[0].user.roles).toEqual([]);
    // No rate yet — the whole reason this row is actionable.
    expect(data[0].configs).toEqual([]);
  });

  it('lavozimni tanlab oladi', async () => {
    await service.listStaff({}, 1001, 1);
    expect(prisma.user.findMany.mock.calls[0][0].select.position).toBe(true);
  });
});
