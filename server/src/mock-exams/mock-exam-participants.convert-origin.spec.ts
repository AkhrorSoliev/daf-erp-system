import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { MockExamBillingService } from './mock-exam-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  SELF_SIGNUP_SOURCE,
  StudentLeadOriginService,
} from '../common/student-origin';

/**
 * Mock imtihon ishtirokchisini o'quvchiga aylantirish lid yozuvi qoldiradi.
 *
 * Bu yo'l ham `/students` eshigidan o'tmay bazaga to'g'ridan yozardi va
 * ADR-0017 tuzatishida ko'rilmay qolgan edi. Qorovul
 * (`student-origin.single-source.spec.ts`) faqat chaqiruv faylda borligini
 * ko'radi; bu test uning to'g'ri qiymatlar bilan, O'SHA tranzaksiya ichida va
 * ishtirokchi bog'lanishidan OLDIN ishlashini tekshiradi.
 */
describe('MockExamParticipantsService.convertToStudent — lid kelib chiqishi', () => {
  const COMPANY = 1001;
  const USER = 42;

  let service: MockExamParticipantsService;
  let prisma: any;
  let tx: any;
  let leadOrigin: { recordSelfSignupOrigin: jest.Mock };
  let order: string[];
  let history: { recordCreate: jest.Mock; recordUpdate: jest.Mock };

  beforeEach(async () => {
    order = [];
    const participant = {
      id: 'part-1',
      examId: 'exam-1',
      publicId: 11200,
      studentId: null,
      firstName: 'Nodira',
      lastName: 'Aliyeva',
      phone: '933334455',
      telegramChatId: '777',
      telegramUsername: 'nodira',
    };

    tx = {
      // Sign-in account (convert-account.spec.ts covers it): phone free,
      // login free.
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(async () => {
          order.push('student');
          return {
            id: 11200,
            firstName: 'Nodira',
            lastName: 'Aliyeva',
            phone: '933334455',
          };
        }),
      },
      mockExamParticipant: {
        update: jest.fn(async () => {
          order.push('participant-link');
          return {};
        }),
      },
    };

    prisma = {
      mockExamParticipant: {
        findFirst: jest.fn().mockResolvedValue(participant),
      },
      mockExam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'REGISTRATION_OPEN',
          branchId: 7,
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };

    leadOrigin = {
      recordSelfSignupOrigin: jest.fn(async () => {
        order.push('lead');
        return { kind: 'created', leadId: 'lead-1' };
      }),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamParticipantsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EntityHistoryService,
          useValue: (history = {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
          }),
        },
        { provide: MockExamBillingService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: StudentLeadOriginService, useValue: leadOrigin },
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

  it("lidni o'quvchi bilan BITTA tranzaksiya ichida yozadi", async () => {
    await run();

    expect(leadOrigin.recordSelfSignupOrigin).toHaveBeenCalledTimes(1);
    const [passedTx] = leadOrigin.recordSelfSignupOrigin.mock.calls[0];
    expect(passedTx).toBe(tx);
  });

  it("yaratilgan o'quvchi, tanlangan filial va mock manbasi bilan chaqiradi", async () => {
    await run();

    const [, params, sourceName] =
      leadOrigin.recordSelfSignupOrigin.mock.calls[0];
    expect(params).toEqual({
      studentId: 11200,
      firstName: 'Nodira',
      lastName: 'Aliyeva',
      phone: '933334455',
      branchId: 7,
      companyId: COMPANY,
      userId: USER,
    });
    expect(sourceName).toBe(SELF_SIGNUP_SOURCE.MOCK_EXAM);
  });

  it("tartib: o'quvchi → lid → ishtirokchi bog'lanishi", async () => {
    await run();

    // Lid yozuvi yiqilsa ishtirokchi o'quvchiga bog'lanib qolmasligi kerak.
    expect(order).toEqual(['student', 'lead', 'participant-link']);
  });

  it("lid yozuvi yiqilsa ishtirokchi o'quvchiga bog'lanmaydi", async () => {
    leadOrigin.recordSelfSignupOrigin.mockRejectedValue(
      new Error('lid yozilmadi'),
    );

    await expect(run()).rejects.toThrow('lid yozilmadi');
    expect(tx.mockExamParticipant.update).not.toHaveBeenCalled();
  });

  // Tashqi odam har imtihonda YANGI publicId oladi. Iyun qatori aylantirilgach,
  // iyul qatori ham "Aylantirish" ko'rsatardi va ikkinchi o'quvchi (bir xil
  // telefon, bir xil Telegram chat, ikkinchi lid) yaratilardi.
  it("shu telefonli o'quvchi bor bo'lsa ikkinchisini yaratmaydi", async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 11100,
      firstName: 'Nodira',
      lastName: 'Aliyeva',
    });

    await expect(run()).rejects.toThrow(BadRequestException);
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: COMPANY, deletedAt: null }),
      }),
    );
  });

  // Filial faqat kompaniya bo'yicha tekshirilardi — A filial admini B filialda
  // o'quvchi yarata olardi.
  it('chaqiruvchi qamrovidan tashqaridagi filialga yozmaydi', async () => {
    await expect(
      service.convertToStudent(
        'part-1',
        { branchId: 7 } as never,
        COMPANY,
        USER,
        [3],
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.student.create).not.toHaveBeenCalled();
  });

  it("ishtirokchi bog'lanishini tarixga yozadi", async () => {
    await run();

    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'MockExamParticipant',
        entityId: 'part-1',
        newValues: expect.objectContaining({ studentId: 11200 }),
      }),
    );
  });
});
