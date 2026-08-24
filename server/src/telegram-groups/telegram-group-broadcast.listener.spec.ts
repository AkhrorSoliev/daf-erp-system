import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import {
  INSTANT_PAYMENT_THRESHOLD_SUM,
  LARGE_PAYMENT_THRESHOLD_SUM,
} from './constants';

describe('TelegramGroupBroadcastListener', () => {
  let listener: TelegramGroupBroadcastListener;
  const broadcast = jest.fn().mockResolvedValue(undefined);
  const push = jest.fn().mockResolvedValue(undefined);
  const mockPrisma = {
    student: { findUnique: jest.fn() },
    group: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupBroadcastListener,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TelegramGroupBroadcastService, useValue: { broadcast } },
        { provide: TelegramGroupDigestBufferService, useValue: { push } },
      ],
    }).compile();
    listener = module.get(TelegramGroupBroadcastListener);
  });

  describe('payment.received', () => {
    const basePayload = {
      paymentId: 'p1',
      studentId: 100,
      method: PaymentMethod.CASH,
      source: PaymentSource.ADMIN_MANUAL,
      studentBalance: 0,
      companyId: 1001,
    };

    it('ignores small cash payments (below digest threshold)', async () => {
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM - 1,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it('buffers large cash payments into the digest (not instant)', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'payment',
          amount: LARGE_PAYMENT_THRESHOLD_SUM,
        }),
      );
    });

    it('buffers external gateway payments regardless of size', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        method: PaymentMethod.PAYME,
        amount: 50_000, // small
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'payment',
          method: PaymentMethod.PAYME,
        }),
      );
    });

    it('broadcasts very large payments instantly (no digest buffering)', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [{ branch: { id: 7, name: 'Filial' } }],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        amount: INSTANT_PAYMENT_THRESHOLD_SUM,
      });
      expect(push).not.toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 1001, branchId: 7 }),
      );
    });
  });

  describe('entity.status.changed', () => {
    const richStudent = {
      firstName: 'Aziz',
      lastName: 'Karimov',
      branches: [{ branch: { id: 7, name: 'Chilonzor' } }],
      enrollments: [
        {
          group: {
            name: 'A1-029',
            course: { name: 'Umumiy nemis tili' },
            teachers: [
              { teacher: { firstName: 'Gulbahor', lastName: 'Tursunova' } },
            ],
          },
        },
        {
          group: {
            name: 'B2-014',
            course: { name: 'Intensiv nemis' },
            teachers: [
              { teacher: { firstName: 'Sardor', lastName: 'Aliyev' } },
            ],
          },
        },
      ],
    };

    it('broadcasts Student ACTIVE → FROZEN enriched + reason, routed to branch', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(richStudent);
      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: 'Dilnoza',
        lastName: 'Karimova',
        roles: [{ role: { name: 'Administrator' } }],
      });
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
        reason: "Ta'tilga chiqdi",
        changedById: 555,
        companyId: 1001,
      });
      const { message, ...rest } = broadcast.mock.calls[0][0];
      expect(rest).toMatchObject({
        companyId: 1001,
        branchId: 7, // routed to the student's branch
        // throttle bucket is per-entity so two students don't collide
        eventClass: 'entity.status.changed:Student:10042',
      });
      expect(message).toContain('muzlatildi');
      expect(message).toContain('Aziz Karimov');
      expect(message).toContain('ID: 10042');
      expect(message).toContain('Chilonzor');
      // every active group on its own line with its teacher(s)
      expect(message).toContain(
        'A1-029 (Umumiy nemis tili) — Gulbahor Tursunova',
      );
      expect(message).toContain('B2-014 (Intensiv nemis) — Sardor Aliyev');
      expect(message).toContain("Sabab: Ta'tilga chiqdi");
      expect(message).toContain('Dilnoza Karimova (Administrator)');
    });

    it('broadcasts Student FROZEN → ACTIVE (qaytadan faol), no reason line', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(richStudent);
      mockPrisma.user.findUnique.mockResolvedValue(null); // changedById absent
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'FROZEN',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      const message = broadcast.mock.calls[0][0].message;
      expect(message).toContain('qaytadan faol');
      expect(message).toContain('Aziz Karimov');
      expect(message).toContain(
        'A1-029 (Umumiy nemis tili) — Gulbahor Tursunova',
      );
      expect(message).not.toContain('Sabab'); // reactivation carries no reason
    });

    it('falls back to a minimal Student message when the row is gone', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'GRADUATED',
        companyId: 1001,
      });
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          branchId: null,
          message: expect.stringContaining('ID: 10042'),
          eventClass: 'entity.status.changed:Student:10042',
        }),
      );
      expect(broadcast.mock.calls[0][0].message).toContain('bitirdi');
    });

    const richGroup = {
      name: 'B1-Intensiv-043',
      level: 'B1',
      branchId: 7,
      lessonStartTime: '18:00',
      lessonEndTime: '19:30',
      exactDays: ['monday', 'wednesday', 'friday'],
      startDate: new Date('2026-06-08T00:00:00.000Z'),
      endDate: new Date('2026-09-08T00:00:00.000Z'),
      course: { name: 'General English' },
      branch: { name: 'Chilonzor' },
      room: { name: '204' },
      teachers: [{ teacher: { firstName: 'Aziz', lastName: 'Karimov' } }],
    };

    it('broadcasts Group FORMING → ACTIVE with enriched details', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(richGroup);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      const { message, ...rest } = broadcast.mock.calls[0][0];
      expect(rest).toMatchObject({
        companyId: 1001,
        branchId: 7, // scoped to the group's branch
        eventClass: 'entity.status.changed:Group:g1',
      });
      expect(message).toContain('boshlandi');
      expect(message).toContain('B1-Intensiv-043');
      expect(message).toContain('Chilonzor');
      expect(message).toContain('B1');
      expect(message).toContain('General English');
      expect(message).toContain('Aziz Karimov');
      expect(message).toContain('Dushanba, Chorshanba, Juma'); // exactDays → Uzbek
      expect(message).toContain('18:00–19:30');
      expect(message).toContain('204');
      expect(message).toContain('08.06.2026'); // startDate
      expect(message).not.toContain('g1'); // no raw UUID
    });

    it('broadcasts Group ACTIVE → COMPLETED with the end date', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(richGroup);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'ACTIVE',
        newStatus: 'COMPLETED',
        companyId: 1001,
      });
      const message = broadcast.mock.calls[0][0].message;
      expect(message).toContain('tugadi');
      expect(message).toContain('B1-Intensiv-043');
      expect(message).toContain('08.09.2026'); // endDate, not startDate
    });

    it('falls back to a minimal message when the group row is gone', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          message: expect.stringContaining('ID: g1'),
          eventClass: 'entity.status.changed:Group:g1',
        }),
      );
    });

    it('is silent for group transitions not in the whitelist', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'CANCELLED',
        companyId: 1001,
      });
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('is silent for transitions not in the whitelist', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'INACTIVE',
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('is silent when companyId is missing', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
      });
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('student.created', () => {
    it('buffers the new student into the digest (no instant broadcast)', async () => {
      await listener.onStudentCreated({
        studentId: 10042,
        firstName: 'Ali',
        lastName: 'Valiyev',
        branchId: 1,
        branchName: 'Asosiy filial',
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'student',
          branchId: 1,
          studentId: 10042,
          name: 'Ali Valiyev',
        }),
      );
    });
  });

  describe('group.created', () => {
    it('buffers the new group into the digest', async () => {
      await listener.onGroupCreated({
        groupId: 'g1',
        name: 'B1-Intensiv',
        branchId: 2,
        branchName: 'Chilonzor',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'group',
          branchId: 2,
          name: 'B1-Intensiv',
        }),
      );
    });
  });
});
