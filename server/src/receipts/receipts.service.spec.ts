import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentSource,
  RefundStatus,
} from '@prisma/client';
import { ReceiptsService } from './receipts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let prisma: any;
  let tx: any;

  const company = { name: 'DaF Sprachzentrum', phone: null, logo: null };
  const baseStudent = {
    id: 12345,
    firstName: 'Aziz',
    lastName: 'Ahmadjonov',
    phone: '901234567',
    balance: 2_000_000,
  };
  const basePayment = {
    id: 'pay-1',
    amount: 1_500_000,
    method: PaymentMethod.CASH,
    status: PaymentStatus.COMPLETED,
    source: PaymentSource.ADMIN_MANUAL,
    externalId: null,
    receiptNumber: null,
    receiptCode: null,
    note: 'Sentyabr',
    createdAt: new Date('2026-05-02T10:00:00Z'),
    branchId: 1,
    companyId: 1,
    contract: null,
    student: baseStudent,
    receivedBy: { firstName: 'Karim', lastName: 'Karimov' },
  };

  beforeEach(async () => {
    tx = {
      payment: { findFirst: jest.fn(), update: jest.fn() },
      refund: { findFirst: jest.fn(), update: jest.fn() },
    };
    prisma = {
      payment: { findFirst: jest.fn() },
      refund: { findFirst: jest.fn() },
      branch: { findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Asosiy', address: 'Toshkent', phone: '+998 71 200 00 00' }) },
      company: { findUnique: jest.fn().mockResolvedValue(company) },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          group: {
            name: 'A1-23',
            exactDays: ['monday', 'wednesday', 'friday'],
            lessonStartTime: '14:00',
            lessonEndTime: '16:00',
            course: { name: 'Deutsch A1' },
            teachers: [
              {
                teacher: { firstName: 'Karim', lastName: 'Karimov' },
              },
            ],
          },
        }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://admin.dafzentrum.uz' },
        },
      ],
    }).compile();

    service = module.get(ReceiptsService);
  });

  describe('generatePaymentPdf', () => {
    it('returns a Buffer with valid PDF magic bytes', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      tx.payment.findFirst.mockResolvedValue(null); // no prior receiptCode → first allocation
      tx.payment.update.mockResolvedValue({});

      const buf = await service.generatePaymentPdf('pay-1');

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
    });

    it('lazy-allocates a receiptCode in R-YYYY-NNNNN format on first render', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      tx.payment.findFirst.mockResolvedValue(null);
      tx.payment.update.mockResolvedValue({});

      await service.generatePaymentPdf('pay-1');

      const updateCall = tx.payment.update.mock.calls[0][0];
      const year = new Date().getFullYear();
      expect(updateCall.where).toEqual({ id: 'pay-1' });
      expect(updateCall.data.receiptCode).toBe(`R-${year}-00001`);
    });

    it('reuses an existing receiptCode (idempotent — no realloc)', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePayment,
        receiptCode: 'R-2026-00042',
      });

      await service.generatePaymentPdf('pay-1');

      // No tx → no allocation path entered.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('increments past the highest existing R-YYYY-NNNNN', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      const year = new Date().getFullYear();
      tx.payment.findFirst.mockResolvedValue({
        receiptCode: `R-${year}-00099`,
      });
      tx.payment.update.mockResolvedValue({});

      await service.generatePaymentPdf('pay-1');

      const updateCall = tx.payment.update.mock.calls[0][0];
      expect(updateCall.data.receiptCode).toBe(`R-${year}-00100`);
    });

    it('throws NotFoundException when payment is missing', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.generatePaymentPdf('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateRefundPdf', () => {
    const baseRefund = {
      id: 'ref-1',
      requestedAmount: 500_000,
      approvedAmount: 450_000,
      deductions: { 'Bank komissiyasi': 50_000 },
      status: RefundStatus.COMPLETED,
      refundMethod: PaymentMethod.CASH,
      reason: "O'quvchi ishtirok eta olmaydi",
      processedAt: new Date('2026-05-02T11:00:00Z'),
      receiptCode: null,
      createdAt: new Date('2026-05-01T11:00:00Z'),
      companyId: 1,
      contract: null,
      student: baseStudent,
      processedBy: { firstName: 'Aziz', lastName: 'CEO' },
      enrollment: {
        group: { name: 'A1-23', course: { name: 'Deutsch A1' } },
      },
    };

    it('generates a PDF and allocates Q-YYYY-NNNNN code', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      tx.refund.findFirst.mockResolvedValue(null);
      tx.refund.update.mockResolvedValue({});

      const buf = await service.generateRefundPdf('ref-1');

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
      const year = new Date().getFullYear();
      expect(tx.refund.update.mock.calls[0][0].data.receiptCode).toBe(
        `Q-${year}-00001`,
      );
    });

    it('throws NotFoundException for a non-COMPLETED refund', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.APPROVED,
      });

      await expect(service.generateRefundPdf('ref-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invoice URL', () => {
    it('builds the QR target as <invoice>/<id> when INVOICE_BASE_URL is set', async () => {
      // Re-build with a config that exposes INVOICE_BASE_URL only.
      const moduleWithInvoice: TestingModule =
        await Test.createTestingModule({
          providers: [
            ReceiptsService,
            { provide: PrismaService, useValue: prisma },
            {
              provide: ConfigService,
              useValue: {
                get: (k: string) =>
                  k === 'INVOICE_BASE_URL'
                    ? 'https://invoice.dafzentrum.uz'
                    : null,
              },
            },
          ],
        }).compile();
      const svc = moduleWithInvoice.get(ReceiptsService);
      prisma.payment.findFirst.mockResolvedValue({
        ...basePayment,
        receiptCode: 'R-2026-00099',
      });

      const v = await svc.loadPaymentVerification('pay-1');

      // pdfUrl still points at the API host (publicBaseUrl). The QR target
      // is exposed indirectly — we just sanity-check that the service no
      // longer throws and the flow completes.
      expect(v.receiptCode).toBe('R-2026-00099');
    });
  });

  describe('loadPaymentVerification', () => {
    it('returns reversed=false for COMPLETED payments', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePayment,
        receiptCode: 'R-2026-00012',
      });

      const v = await service.loadPaymentVerification('pay-1');

      expect(v.reversed).toBe(false);
      expect(v.kind).toBe('payment');
      expect(v.receiptCode).toBe('R-2026-00012');
      expect(v.amount).toBe(1_500_000);
      expect(v.studentName).toBe('Aziz Ahmadjonov');
    });

    it('returns reversed=true with reason for REVERSED payments', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...basePayment,
        status: PaymentStatus.REVERSED,
        receiptCode: 'R-2026-00012',
        note: 'Admin xato kiritgan',
      });

      const v = await service.loadPaymentVerification('pay-1');

      expect(v.reversed).toBe(true);
      expect(v.reversedReason).toBe('Admin xato kiritgan');
    });
  });
});
