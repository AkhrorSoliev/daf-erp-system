import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from './student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Prodda 936 o'quvchidan 892 tasi /students eshigidan kirgan va lid yozuvi
 * qoldirmagan. Bu testlar shu eshikni yopadi.
 */
describe('StudentsWriteService — lid kelib chiqishi', () => {
  let service: StudentsWriteService;
  let origin: { recordDirectOrigin: jest.Mock };
  let tx: any;

  const COMPANY = 1001;
  const dto = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    branchIds: [7],
  } as any;

  beforeEach(async () => {
    const created = { id: 555, firstName: 'Ali', lastName: 'Valiyev' };
    tx = {
      student: {
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...created,
          // `studentSelect.branches` haqiqiy Prisma shakli: har bir qator
          // ichma-ich `branch` obyektini olib yuradi (formatStudent shuni kutadi).
          branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
          enrollments: [],
        }),
      },
      studentBranch: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      lead: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 7 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      // Callback'ni HAQIQATDAN chaqiradi — lid yozuvi shu ichida bo'lishi kerak.
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    origin = { recordDirectOrigin: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: StudentLeadOriginService, useValue: origin },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
        { provide: TransactionsService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentsWriteService);
    jest
      .spyOn(service as any, 'createStudentUser')
      .mockResolvedValue({ plainPassword: 'x' });
  });

  it("DIRECT bo'lsa lid yozuvi tranzaksiya ichida yaratiladi", async () => {
    await service.create(dto, COMPANY, 42, {
      kind: 'DIRECT',
      sourceId: 'src-instagram',
    });

    expect(origin.recordDirectOrigin).toHaveBeenCalledTimes(1);
    const [passedTx, params] = origin.recordDirectOrigin.mock.calls[0];
    expect(passedTx).toBe(tx);
    expect(params).toMatchObject({
      studentId: 555,
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '901234567',
      branchId: 7,
      companyId: COMPANY,
      sourceId: 'src-instagram',
      userId: 42,
    });
  });

  it("LEAD bo'lsa ikkinchi lid yozuvi yaratilmaydi", async () => {
    await service.create(dto, COMPANY, 42, {
      kind: 'LEAD',
      leadId: 'lead-1',
    });

    expect(origin.recordDirectOrigin).not.toHaveBeenCalled();
  });
});
