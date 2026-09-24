import { Test, TestingModule } from '@nestjs/testing';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { SmsEventsListener } from './sms-events.listener';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('SmsEventsListener', () => {
  let listener: SmsEventsListener;
  let enqueue: jest.Mock;

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsEventsListener,
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(SmsEventsListener);
  });

  const enrolled = {
    studentId: 10001,
    groupName: 'A1-1',
    courseName: 'Standard Deutsch',
    days: 'odd',
    exactDays: [],
    lessonStartTime: '09:00',
    lessonEndTime: '10:30',
    companyId: 1,
  };

  describe('handleStudentEnrolled', () => {
    it('queues the enrollment notice with the template fields', async () => {
      await listener.handleStudentEnrolled(enrolled);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.STUDENT_ENROLLED,
        payload: {
          groupName: 'A1-1',
          courseName: 'Standard Deutsch',
          days: 'odd',
          exactDays: [],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
        },
      });
    });

    it('passes exact weekdays through unchanged', async () => {
      await listener.handleStudentEnrolled({
        ...enrolled,
        days: null,
        exactDays: ['monday', 'wednesday', 'friday'],
      });
      expect(enqueue.mock.calls[0][0].payload.exactDays).toEqual([
        'monday',
        'wednesday',
        'friday',
      ]);
    });

    it('does not queue without a company id', async () => {
      await listener.handleStudentEnrolled({ ...enrolled, companyId: null });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleStudentEnrolled(enrolled),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleStudentRemoved', () => {
    const removed = {
      studentId: 10001,
      groupName: 'A1-1',
      reason: "To'lov qilmagan",
      companyId: 1,
    };

    it('queues the removal notice with group and reason', async () => {
      await listener.handleStudentRemoved(removed);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.STUDENT_REMOVED,
        payload: { groupName: 'A1-1', reason: "To'lov qilmagan" },
      });
    });

    it('does not queue without a company id', async () => {
      await listener.handleStudentRemoved({ ...removed, companyId: null });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleStudentRemoved(removed),
      ).resolves.toBeUndefined();
    });
  });
});
