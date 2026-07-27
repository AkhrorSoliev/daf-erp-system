import { Test } from '@nestjs/testing';
import { MockExamGatewayBillingService } from './mock-exam-gateway-billing.service';
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
    mockExamParticipant: { findFirst: jest.Mock };
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
      mockExamParticipant: { findFirst: jest.fn() },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MockExamGatewayBillingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(MockExamGatewayBillingService);
  });

  it("to'lanmagan ishtirokchi + mos summa → mock yo'liga yuboradi", async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(participant());
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(true);
  });

  it("qarzdor o'quvchida ham mock yo'liga yuboradi (balansga qaramaydi)", async () => {
    // Balans umuman so'ralmaydi — asosiy tuzatish shu.
    prisma.mockExamParticipant.findFirst.mockResolvedValue(participant());
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(true);
  });

  it("ishtirokchi yo'q bo'lsa aralashmaydi", async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(null);
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it("allaqachon to'langan bo'lsa aralashmaydi", async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(
      participant({ paid: true }),
    );
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it("summa mos kelmasa aralashmaydi (balans to'ldirish)", async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(participant());
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 400000 }),
    ).resolves.toBe(false);
  });

  it('bepul imtihonda aralashmaydi', async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(
      participant({ feeAmount: 0, exam: { price: 0 } }),
    );
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 0 }),
    ).resolves.toBe(false);
  });

  it("portaldan boshlangan tirik PaymentIntent bo'lsa — balans to'ldirish deb qoldiradi", async () => {
    // O'quvchi ataylab mock narxiga teng summani balansiga to'ldirmoqchi:
    // uning pulini imtihonga o'g'irlab ketmaymiz.
    prisma.mockExamParticipant.findFirst.mockResolvedValue(participant());
    prisma.paymentIntent.findFirst.mockResolvedValue({ id: 'intent-1' });
    await expect(service.shouldRouteToMock(ARGS)).resolves.toBe(false);
  });

  it("eski feeAmount=null qatorda imtihon narxiga qaraydi", async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(
      participant({ feeAmount: null, exam: { price: 40000 } }),
    );
    await expect(
      service.shouldRouteToMock({ ...ARGS, amountSom: 40000 }),
    ).resolves.toBe(true);
  });

  it('PaymentIntent qidiruvi provider va summaga bog\'langan', async () => {
    prisma.mockExamParticipant.findFirst.mockResolvedValue(participant());
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
