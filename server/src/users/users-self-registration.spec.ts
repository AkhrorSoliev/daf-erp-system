import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * A staff member registering THEMSELVES through the Telegram bot has no
 * signed-in caller — they are a stranger holding a signed invitation link.
 *
 * The branch-confinement sweep (#419) added a caller-scope check to every
 * branch on `create`, and `resolveCallerBranchScope` refuses an absent
 * caller. The bot passed none, so every bot registration — teacher,
 * administrator, cashier, in EVERY branch — died with "Foydalanuvchi
 * aniqlanmadi" and the scene's bare `catch` turned it into a generic
 * apology. Neither suite caught it: the scene specs mock `UsersService`, and
 * the branch spec always supplies a caller.
 *
 * So the actor is now stated rather than inferred from a missing argument.
 */
describe('UsersService — self-registration through the bot', () => {
  let service: UsersService;
  let prisma: any;

  const NAMANGAN = 2;
  const teacherPayload = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    companyId: 1001,
    login: '901234567',
    phone: '901234567',
    password: 'secret',
    position: "O'qituvchi",
    roleIds: [4],
    branchIds: [NAMANGAN],
    mainBranch: NAMANGAN,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 999,
          companyId: 1001,
          roles: [],
          branches: [],
        }),
      },
      // Every named branch is real and in the company — what is under test is
      // the caller check, which must not run at all without a caller.
      branch: {
        count: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where.id.in.length),
          ),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 4 }]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('creates a teacher who registered themselves via a signed link', async () => {
    await service.create(teacherPayload, { kind: 'self-registration' });
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('never asks the branch-scope resolver about a caller that does not exist', async () => {
    await service.create(teacherPayload, { kind: 'self-registration' });
    // `resolveCallerBranchScope` chaqiruvchini `user.findFirst({ where: { id } })`
    // bilan yuklaydi. Chaqiruvchi yo'q — hech kim uni qidirmasligi kerak.
    // (Telefon qoidasi ham `findFirst` ishlatadi, lekin `where.id` siz.)
    const callerLookups = prisma.user.findFirst.mock.calls.filter(
      ([args]: any[]) => args?.where?.id !== undefined,
    );
    expect(callerLookups).toHaveLength(0);
  });

  it('still enforces every rule that is not about the caller', async () => {
    // The branch must be real and in the company…
    prisma.branch.count.mockResolvedValueOnce(0);
    await expect(
      service.create(teacherPayload, { kind: 'self-registration' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // …and a teacher without a branch is refused whoever asks.
    await expect(
      service.create(
        { ...teacherPayload, branchIds: undefined, mainBranch: undefined },
        { kind: 'self-registration' },
      ),
    ).rejects.toThrow(/O'qituvchi uchun kamida bitta filial/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a caller-shaped actor whose id is missing', async () => {
    // The fail-closed half: an ordinary write that forgot to carry its caller
    // must NOT silently become a self-registration.
    await expect(
      service.create(teacherPayload, { kind: 'user', id: undefined as any }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('ishlab turgan xodim raqami bilan ikkinchi xodim hisobi ochilmaydi', async () => {
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.roles
          ? { id: 10924, firstName: 'Nodira', lastName: 'Yusupova' }
          : null,
      ),
    );

    await expect(
      service.create(teacherPayload, { kind: 'self-registration' }),
    ).rejects.toThrow(/xodim hisobi allaqachon bor/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("o'quvchi hisobidagi raqam bilan xodim hisobi ochiladi", async () => {
    // Faqat xodim rolli hisoblar so'raladi — o'quvchi hisobi topilmaydi.
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.roles ? null : { id: 10018 }),
    );

    await service.create(teacherPayload, { kind: 'self-registration' });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("rolsiz xodimga telefon qoidasi qo'llanmaydi", async () => {
    await service.create(
      {
        firstName: 'Olim',
        lastName: 'Toshev',
        companyId: 1001,
        phone: '901234567',
        position: 'Farrosh',
        roleIds: [],
        branchIds: [NAMANGAN],
      },
      { kind: 'self-registration' },
    );

    const staffLookups = prisma.user.findFirst.mock.calls.filter(
      ([args]: any[]) => args?.where?.roles,
    );
    expect(staffLookups).toHaveLength(0);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});
