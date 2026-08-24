import { Test } from '@nestjs/testing';
import { MockExamGatewayBillingService } from './mock-exam-gateway-billing.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mock havolasi orqali kelgan pul FAQAT mock uchun ishlatilishi kerak —
 * o'quvchining balansiga ham, qarziga ham tegmasligi shart.
 *
 * REGRESSIYA: DaF o'quvchisida `publicId === Student.id` bo'lgani uchun
 * webhook to'lovni o'quvchi balansiga yozardi. Qarzi bor o'quvchida pul
 * qarzga so'rilib ketar, imtihon esa "kutilmoqda" bo'lib qolaverardi —
 * ya'ni qarzdor o'quvchi mock uchun umuman to'lay olmasdi.
 */
describe('MockExamGatewayBillingService — shouldRouteToMock', () => {
  let service: MockExamGatewayBillingService;
  let prisma: {
    mockExamParticipant: { findMany: jest.Mock };
    paymentIntent: { findFirst: jest.Mock };
  };

  const participant = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    paid: false,
    feeAmount: 2000,
    exam: { price: 2000 },
    ...over,
  });

  const ARGS = {
    publicId: 10003,
    amountSom: 2000,
    provider: 'CLICK' as const,
    companyId: 1001,
  };

  beforeEach(async () => {
    prisma = {
      mockExamParticipant: { findMany: jest.fn() },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MockExamGatewayBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(MockExamGatewayBillingService);
  });

  it("to'lanmagan ishtirokchi + mos summa → mock yo'liga yuboradi", async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([participant()]);
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(true);
  });

  it("qarzdor o'quvchida ham mock yo'liga yuboradi (balansga qaramaydi)", async () => {
    // Balans umuman so'ralmaydi — asosiy tuzatish shu.
    prisma.mockExamParticipant.findMany.mockResolvedValue([participant()]);
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(true);
  });

  it("ishtirokchi yo'q bo'lsa aralashmaydi", async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([]);
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it("allaqachon to'langan bo'lsa aralashmaydi", async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([
      participant({ paid: true }),
    ]);
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it("summa mos kelmasa aralashmaydi (balans to'ldirish)", async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([participant()]);
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 400000 }),
    ).resolves.toBe(false);
  });

  it('bepul imtihonda aralashmaydi', async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([
      participant({ feeAmount: 0, exam: { price: 0 } }),
    ]);
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 0 }),
    ).resolves.toBe(false);
  });

  it("portaldan boshlangan tirik PaymentIntent bo'lsa — balans to'ldirish deb qoldiradi", async () => {
    // O'quvchi ataylab mock narxiga teng summani balansiga to'ldirmoqchi:
    // uning pulini imtihonga o'g'irlab ketmaymiz.
    prisma.mockExamParticipant.findMany.mockResolvedValue([participant()]);
    prisma.paymentIntent.findFirst.mockResolvedValue({ id: 'intent-1' });
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it('eski feeAmount=null qatorda imtihon narxiga qaraydi', async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([
      participant({ feeAmount: null, exam: { price: 40000 } }),
    ]);
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 40000 }),
    ).resolves.toBe(true);
  });

  /**
   * ASOSIY REGRESSIYA — jonli testda aynan shu tishladi.
   *
   * `resolveTarget` ilgari `findFirst` ishlatardi: tartibsiz, odatda ENG ESKI
   * qatorni olardi. DaF o'quvchisi bir nechta imtihonga yozilganda (bizda 6 ta
   * edi) yangi imtihon uchun to'laganda summa eski imtihon narxi bilan
   * solishtirilib, "mos emas" deb o'quvchi yo'liga tushib ketardi.
   */
  describe('bir odamda bir nechta ishtirokchi', () => {
    const many = [
      // findMany `registeredAt: desc` bilan qaytaradi — yangidan eskiga.
      participant({ id: 'test2', feeAmount: 1000, exam: { price: 1000 } }),
      participant({ id: 'test1', feeAmount: 2000, exam: { price: 1000 } }),
      participant({ id: 'test28', feeAmount: 0, exam: { price: 0 } }),
      participant({ id: 'mockA1', feeAmount: null, exam: { price: 40000 } }),
    ];

    it('summaga MOS keladigan ishtirokchini tanlaydi (eng eskisini emas)', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue(many);
      const t = await service.resolveTarget(10003, 1000);
      expect(t).toEqual({
        participantId: 'test2',
        examPrice: 1000,
        alreadyPaid: false,
      });
    });

    it('boshqa summa boshqa ishtirokchini topadi', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue(many);
      const t = await service.resolveTarget(10003, 2000);
      expect(t?.participantId).toBe('test1');
    });

    it("mos summada mock yo'liga yuboradi", async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue(many);
      await expect(
        service.shouldRouteToMock({ ...ARGS, amountSom: 1000 }),
      ).resolves.toBe(true);
    });

    it('hech qaysi narxga mos kelmasa aralashmaydi', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue(many);
      await expect(
        service.shouldRouteToMock({ ...ARGS, amountSom: 555000 }),
      ).resolves.toBe(false);
    });

    it("mos summa to'langan bo'lsa, boshqa to'lanmaganiga o'tmaydi", async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        participant({
          id: 'test2',
          feeAmount: 1000,
          paid: true,
          exam: { price: 1000 },
        }),
        participant({ id: 'test1', feeAmount: 2000, exam: { price: 2000 } }),
      ]);
      // 1000 uchun mos to'lanmagan yo'q → eng yangi to'lanmagani (2000) qaytadi,
      // lekin summa mos kelmagani uchun mock yo'liga YUBORILMAYDI.
      await expect(
        service.shouldRouteToMock({ ...ARGS, amountSom: 1000 }),
      ).resolves.toBe(false);
    });

    it("hammasi to'langan bo'lsa alreadyPaid qaytaradi", async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        participant({ id: 'a', paid: true }),
      ]);
      const t = await service.resolveTarget(10003, 2000);
      expect(t?.alreadyPaid).toBe(true);
    });
  });

  /**
   * REGRESSIYA: shlyuz orqali to'langanda ishtirokchi "to'langan" bo'lardi,
   * lekin bot JIM qolardi — `mock.participant.paid` hodisasi faqat admin naqd
   * to'lovni qabul qilganda chiqarilardi. Foydalanuvchi to'lovi o'tgan-o'tmaganini
   * bilmasdi va to'lov tugmalari ekranda turaverardi.
   */
  describe("markCompleted — to'lov haqida xabar", () => {
    it('mock.participant.paid hodisasini chiqaradi', async () => {
      const emit = jest.fn();
      const tx = {
        mockExamGatewayTransaction: {
          update: jest.fn().mockResolvedValue({ mockParticipantId: 'p1' }),
        },
        mockExamParticipant: {
          update: jest.fn().mockResolvedValue({
            telegramChatId: '1647226871',
            publicId: 10003,
            feeAmount: 3000,
            exam: { title: 'Test 3', price: 3000 },
          }),
        },
      };
      const p: any = {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      };
      const mod = await Test.createTestingModule({
        providers: [
          MockExamGatewayBillingService,
          { provide: PrismaService, useValue: p },
          { provide: EventEmitter2, useValue: { emit } },
        ],
      }).compile();

      await mod.get(MockExamGatewayBillingService).markCompleted('txn-1');

      expect(tx.mockExamParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paid: true }),
        }),
      );
      expect(emit).toHaveBeenCalledWith('mock.participant.paid', {
        telegramChatId: '1647226871',
        publicId: 10003,
        examTitle: 'Test 3',
        feeAmount: 3000,
      });
    });

    it('eski feeAmount=null qatorda imtihon narxini yuboradi', async () => {
      const emit = jest.fn();
      const tx = {
        mockExamGatewayTransaction: {
          update: jest.fn().mockResolvedValue({ mockParticipantId: 'p1' }),
        },
        mockExamParticipant: {
          update: jest.fn().mockResolvedValue({
            telegramChatId: '1',
            publicId: 10,
            feeAmount: null,
            exam: { title: 'Eski', price: 40000 },
          }),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          MockExamGatewayBillingService,
          {
            provide: PrismaService,
            useValue: { $transaction: async (fn: any) => fn(tx) },
          },
          { provide: EventEmitter2, useValue: { emit } },
        ],
      }).compile();

      await mod.get(MockExamGatewayBillingService).markCompleted('txn-1');

      expect(emit).toHaveBeenCalledWith(
        'mock.participant.paid',
        expect.objectContaining({ feeAmount: 40000 }),
      );
    });
  });

  it("PaymentIntent qidiruvi provider va summaga bog'langan", async () => {
    prisma.mockExamParticipant.findMany.mockResolvedValue([participant()]);
    await service.shouldRouteToMock({ ...ARGS, provider: 'PAYME' });
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 10003,
          provider: 'PAYME',
          amount: 2000,
          used: false,
        }),
      }),
    );
  });
});
