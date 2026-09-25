import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { OWN_SIGN_IN_KEYS_MESSAGE } from '../common/auth/own-sign-in-keys';
import { PHONE_HELD_BY_STAFF_MESSAGE } from '../common/auth/phone-account-rules';

const TEACHER_ID = 20;
const CEO_ID = 2;

describe('TeachersService.update — own sign-in keys and phone changes (ADR-0031)', () => {
  let service: TeachersService;
  let prisma: any;
  let upload: { deleteFile: jest.Mock };
  let state: {
    teacher: any;
    staffHolder: object | null;
    loginHolder: object | null;
  };

  const ceoCaller = {
    id: CEO_ID,
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  function makeTeacher(overrides: object = {}) {
    return {
      id: TEACHER_ID,
      firstName: 'Dilnoza',
      lastName: 'Rahimova',
      phone: '901112233',
      login: '901112233',
      photo: null,
      companyId: 1001,
      mainBranch: 500,
      roles: [{ role: { id: 4, name: 'Teacher' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    state = { teacher: makeTeacher(), staffHolder: null, loginHolder: null };
    upload = { deleteFile: jest.fn() };
    prisma = {
      user: {
        // The teacher lookup filters on roleId 4, the staff-duplicate lookup
        // on roleId in [...], login checks on login, the branch guard by id.
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.roles?.some?.roleId === 4)
            return Promise.resolve(state.teacher);
          if (where?.roles) return Promise.resolve(state.staffHolder);
          if (where?.login !== undefined)
            return Promise.resolve(state.loginHolder);
          if (where?.id === CEO_ID) return Promise.resolve(ceoCaller);
          if (where?.id === TEACHER_ID) return Promise.resolve(state.teacher);
          return Promise.resolve(null);
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...state.teacher, ...data }),
          ),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        {
          provide: RedisService,
          useValue: { set: jest.fn(), del: jest.fn(), get: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordUpdate: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(TeachersService);
  });

  it.each([
    ['phone', { phone: '909998877' }],
    ['login', { login: 'dilnoza2' }],
    ['password', { password: 'secret2' }],
  ])(
    'refuses a director who teaches changing their own %s here',
    async (_what, dto) => {
      const error = await service
        .update(TEACHER_ID, dto as any, 1001, TEACHER_ID)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as Error).message).toBe(OWN_SIGN_IN_KEYS_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );

  it('accepts the stored phone re-sent by yourself with a name change', async () => {
    await service.update(
      TEACHER_ID,
      { firstName: 'Dilnoza', phone: '901112233' } as any,
      1001,
      TEACHER_ID,
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it("moves a teacher's login that held the old number", async () => {
    await service.update(
      TEACHER_ID,
      { phone: '909998877', login: '901112233' } as any,
      1001,
      CEO_ID,
    );
    expect(prisma.user.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ phone: '909998877', login: '909998877' }),
    );
  });

  it('lets a deliberately typed new login win over the move', async () => {
    await service.update(
      TEACHER_ID,
      { phone: '909998877', login: 'dilnoza-new' } as any,
      1001,
      CEO_ID,
    );
    expect(prisma.user.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ phone: '909998877', login: 'dilnoza-new' }),
    );
  });

  it('refuses a number another live staff account holds', async () => {
    state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
    await expect(
      service.update(TEACHER_ID, { phone: '909998877' } as any, 1001, CEO_ID),
    ).rejects.toThrow(PHONE_HELD_BY_STAFF_MESSAGE);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('leaves the old photo in place when the phone change is refused', async () => {
    state.teacher = makeTeacher({ photo: 'https://cdn.example/old.jpg' });
    state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
    await expect(
      service.update(
        TEACHER_ID,
        { phone: '909998877', photo: 'https://cdn.example/new.jpg' } as any,
        1001,
        CEO_ID,
      ),
    ).rejects.toThrow(PHONE_HELD_BY_STAFF_MESSAGE);
    expect(upload.deleteFile).not.toHaveBeenCalled();
  });
});
