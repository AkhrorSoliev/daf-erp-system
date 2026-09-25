import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { MockExamBillingService } from './mock-exam-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentLeadOriginService } from '../common/student-origin';

/**
 * Converting a mock participant opens the new student's sign-in account.
 *
 * Every other way a student card is born opens one (admin create, Telegram
 * registration). This path wrote the card straight to the database and left
 * it without an account: the student could not sign in with a password or
 * with Telegram, and the bot's "Parolni tiklash" answered "no account".
 */
describe('MockExamParticipantsService.convertToStudent — sign-in account', () => {
  const COMPANY = 1001;
  const USER = 42;
  const PHONE = '933334455';

  let service: MockExamParticipantsService;
  let prisma: any;
  let tx: any;
  let history: { recordCreate: jest.Mock; recordUpdate: jest.Mock };

  beforeEach(async () => {
    tx = {
      student: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 11200,
          firstName: 'Nodira',
          lastName: 'Aliyeva',
          phone: PHONE,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
      mockExamParticipant: { update: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      mockExamParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'part-1',
          examId: 'exam-1',
          publicId: 11200,
          studentId: null,
          firstName: 'Nodira',
          lastName: 'Aliyeva',
          phone: PHONE,
          telegramChatId: null,
          telegramUsername: null,
        }),
      },
      mockExam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'REGISTRATION_OPEN',
          branchId: 7,
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      // The same-person check before the transaction: no card holds this
      // phone or chat yet.
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };

    history = { recordCreate: jest.fn(), recordUpdate: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: MockExamBillingService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: StudentLeadOriginService,
          useValue: {
            recordSelfSignupOrigin: jest
              .fn()
              .mockResolvedValue({ kind: 'created', leadId: 'lead-1' }),
          },
        },
      ],
    }).compile();

    service = mod.get(MockExamParticipantsService);
  });

  const run = () =>
    service.convertToStudent(
      'part-1',
      { branchId: 7 } as never,
      COMPANY,
      USER,
      null,
    );

  it('opens a Student account on the participant phone, in the conversion transaction', async () => {
    await run();

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      login: PHONE,
      phone: PHONE,
      firstName: 'Nodira',
      lastName: 'Aliyeva',
      companyId: COMPANY,
      roles: { create: [{ roleId: 6 }] },
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 11200 },
      data: { userId: 30001 },
    });
  });

  it('never hands the password back — the student gets one from the bot', async () => {
    const result = await run();

    expect(result).toEqual({
      id: 11200,
      firstName: 'Nodira',
      lastName: 'Aliyeva',
      phone: PHONE,
    });
  });

  it('records the open account on the new card history', async () => {
    await run();

    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 11200,
        newValues: expect.objectContaining({
          kirishHisobi: 'Ochiq',
          login: PHONE,
        }),
      }),
    );
  });

  it('does not link the participant when the account cannot be opened', async () => {
    tx.user.create.mockRejectedValue(new Error('account not written'));

    await expect(run()).rejects.toThrow('account not written');
    expect(tx.mockExamParticipant.update).not.toHaveBeenCalled();
    expect(history.recordCreate).not.toHaveBeenCalled();
  });

  it('refuses a phone that is already on a live card and writes nothing', async () => {
    tx.student.findFirst.mockResolvedValue({ id: 10999 });

    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.student.findFirst).toHaveBeenCalledWith({
      where: { phone: PHONE, deletedAt: null },
      select: { id: true },
    });
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.mockExamParticipant.update).not.toHaveBeenCalled();
  });
});
