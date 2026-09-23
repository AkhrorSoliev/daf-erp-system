import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TransactionType,
} from '@prisma/client';
import { StudentDebtNotificationListener } from './student-debt-notification.listener';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('StudentDebtNotificationListener', () => {
  let listener: StudentDebtNotificationListener;
  let attendanceFindFirst: jest.Mock;
  let transactionFindFirst: jest.Mock;
  let enqueue: jest.Mock;

  const event = (newStatus: AttendanceStatus) => ({
    studentId: 10042,
    groupId: 'g1',
    groupName: 'A1-01',
    date: '2026-09-23',
    oldStatus: null,
    newStatus,
    companyId: 1001,
  });

  beforeEach(async () => {
    attendanceFindFirst = jest.fn().mockResolvedValue({ id: 'att-1' });
    transactionFindFirst = jest.fn().mockResolvedValue({
      metadata: { mode: 'SINGLE_UNCOVERED', perLessonCost: 20000 },
    });
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentDebtNotificationListener,
        {
          provide: PrismaService,
          useValue: {
            attendance: { findFirst: attendanceFindFirst },
            transaction: { findFirst: transactionFindFirst },
          },
        },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(StudentDebtNotificationListener);
  });

  it('ignores statuses that never bill (EXCUSED)', async () => {
    await listener.handle(event(AttendanceStatus.EXCUSED));
    expect(attendanceFindFirst).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('looks the attendance up by group, student and UTC-midnight date', async () => {
    await listener.handle(event(AttendanceStatus.PRESENT));
    expect(attendanceFindFirst).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        studentId: 10042,
        date: new Date('2026-09-23T00:00:00.000Z'),
      },
      select: { id: true },
    });
    expect(transactionFindFirst).toHaveBeenCalledWith({
      where: {
        attendanceId: 'att-1',
        studentId: 10042,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
      },
      select: { metadata: true },
    });
  });

  it('does nothing when the lesson was covered by the balance', async () => {
    transactionFindFirst.mockResolvedValue(null);
    await listener.handle(event(AttendanceStatus.ABSENT));
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues a DEBT_CHARGE row when the lesson went uncovered', async () => {
    await listener.handle(event(AttendanceStatus.LATE));
    expect(enqueue).toHaveBeenCalledWith({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10042,
      companyId: 1001,
      category: TelegramDigestCategory.DEBT_CHARGE,
      relatedEntityId: 'att-1',
      payload: {
        attendanceId: 'att-1',
        groupName: 'A1-01',
        perLessonCost: 20000,
        date: '2026-09-23',
      },
    });
  });

  it('does nothing when the attendance row is missing', async () => {
    attendanceFindFirst.mockResolvedValue(null);
    await listener.handle(event(AttendanceStatus.PRESENT));
    expect(transactionFindFirst).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('swallows database errors without throwing', async () => {
    attendanceFindFirst.mockRejectedValue(new Error('db down'));
    await expect(
      listener.handle(event(AttendanceStatus.PRESENT)),
    ).resolves.toBeUndefined();
  });
});
