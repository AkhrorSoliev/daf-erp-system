import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';

describe('UsersService — updateUser status/isActive sync', () => {
  let service: UsersService;
  let prisma: any;

  const mockUser = {
    id: 1,
    firstName: 'Test',
    lastName: 'Admin',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [],
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
  };

  const updateMock = jest.fn();

  beforeEach(async () => {
    updateMock.mockReset();
    updateMock.mockImplementation(({ data }) =>
      Promise.resolve({ ...mockUser, ...data }),
    );

    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(mockUser),
        update: updateMock,
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
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
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('sets isActive=false when status is changed to INACTIVE', async () => {
    await service.updateUser(1, { status: 'INACTIVE' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INACTIVE',
          isActive: false,
        }),
      }),
    );
  });

  it('sets isActive=false when status is changed to TERMINATED', async () => {
    await service.updateUser(1, { status: 'TERMINATED' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TERMINATED',
          isActive: false,
        }),
      }),
    );
  });

  it('sets isActive=true when status is changed to ACTIVE', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...mockUser,
      status: 'INACTIVE',
      isActive: false,
    });

    await service.updateUser(1, { status: 'ACTIVE' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          isActive: true,
        }),
      }),
    );
  });

  it('does not touch isActive when status is not in the dto', async () => {
    await service.updateUser(1, { firstName: 'Renamed' } as any, 2);

    const dataArg = updateMock.mock.calls[0][0].data;
    expect(dataArg).not.toHaveProperty('isActive');
    expect(dataArg).not.toHaveProperty('status');
    expect(dataArg).toEqual({ firstName: 'Renamed' });
  });
});
