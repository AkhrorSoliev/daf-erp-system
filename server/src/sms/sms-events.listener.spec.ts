import { Test, TestingModule } from '@nestjs/testing';
import { SmsEventsListener } from './sms-events.listener';
import { SmsService } from './sms.service';

describe('SmsEventsListener', () => {
  let listener: SmsEventsListener;
  let smsService: any;

  beforeEach(async () => {
    smsService = {
      sendToStudent: jest
        .fn()
        .mockResolvedValue({ id: 'sms-1', status: 'SENT' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsEventsListener,
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    listener = module.get<SmsEventsListener>(SmsEventsListener);
  });

  describe('handleStudentEnrolled', () => {
    it('should send enrollment SMS with correct message', async () => {
      await listener.handleStudentEnrolled({
        studentId: 10001,
        groupName: 'A1-1',
        courseName: 'Standard Deutsch',
        days: 'odd',
        exactDays: [],
        lessonStartTime: '09:00',
        lessonEndTime: '10:30',
        companyId: 1,
      });

      expect(smsService.sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.stringContaining('A1-1'),
        'AUTO',
        undefined,
        1,
      );
      expect(smsService.sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.stringContaining('Standard Deutsch'),
        'AUTO',
        undefined,
        1,
      );
    });

    it('should handle exactDays format', async () => {
      await listener.handleStudentEnrolled({
        studentId: 10001,
        groupName: 'B1-2',
        courseName: 'Intensiv',
        days: null,
        exactDays: ['monday', 'wednesday', 'friday'],
        lessonStartTime: '14:00',
        lessonEndTime: '15:30',
        companyId: 1,
      });

      expect(smsService.sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.stringContaining('Dushanba, Chorshanba, Juma'),
        'AUTO',
        undefined,
        1,
      );
    });

    it('should not throw if smsService fails', async () => {
      smsService.sendToStudent.mockRejectedValue(new Error('DB error'));

      await expect(
        listener.handleStudentEnrolled({
          studentId: 10001,
          groupName: 'A1-1',
          courseName: 'Test',
          days: null,
          exactDays: [],
          lessonStartTime: null,
          lessonEndTime: null,
          companyId: null,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('handleStudentRemoved', () => {
    it('should send removal SMS with group name and reason', async () => {
      await listener.handleStudentRemoved({
        studentId: 10001,
        groupName: 'A1-1',
        reason: "To'lov qilmagan",
        companyId: 1,
      });

      expect(smsService.sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.stringContaining('A1-1'),
        'AUTO',
        undefined,
        1,
      );
      expect(smsService.sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.stringContaining("To'lov qilmagan"),
        'AUTO',
        undefined,
        1,
      );
    });

    it('should not throw if smsService fails', async () => {
      smsService.sendToStudent.mockRejectedValue(new Error('Network error'));

      await expect(
        listener.handleStudentRemoved({
          studentId: 10001,
          groupName: 'A1-1',
          reason: 'Test',
          companyId: null,
        }),
      ).resolves.not.toThrow();
    });
  });
});
