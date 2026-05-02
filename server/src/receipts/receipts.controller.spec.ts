import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { IS_PUBLIC_KEY } from '../common/decorators';

describe('ReceiptsController — public + content-type', () => {
  let controller: ReceiptsController;
  let reflector: Reflector;

  const mockService = {
    generatePaymentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    generateRefundPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    loadPaymentVerification: jest
      .fn()
      .mockResolvedValue({ kind: 'payment', reversed: false }),
    loadRefundVerification: jest
      .fn()
      .mockResolvedValue({ kind: 'refund', reversed: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [{ provide: ReceiptsService, useValue: mockService }],
    }).compile();

    controller = module.get(ReceiptsController);
    reflector = new Reflector();
  });

  describe('downloadPayment()', () => {
    it('is marked @Public() so JWT guard skips it', () => {
      const isPublic = reflector.get<boolean>(
        IS_PUBLIC_KEY,
        controller.downloadPayment,
      );
      expect(isPublic).toBe(true);
    });

    it('streams a PDF with application/pdf content-type', async () => {
      const headers: Record<string, string | number> = {};
      let bodyEnd: Buffer | undefined;
      const res = {
        setHeader: (k: string, v: string | number) => {
          headers[k] = v;
        },
        end: (body: Buffer) => {
          bodyEnd = body;
        },
      } as unknown as Parameters<typeof controller.downloadPayment>[1];

      await controller.downloadPayment('pay-1', res);

      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['Content-Disposition']).toContain('inline');
      expect(bodyEnd).toBeDefined();
      expect(bodyEnd!.toString().startsWith('%PDF')).toBe(true);
    });
  });

  describe('downloadRefund()', () => {
    it('is marked @Public()', () => {
      const isPublic = reflector.get<boolean>(
        IS_PUBLIC_KEY,
        controller.downloadRefund,
      );
      expect(isPublic).toBe(true);
    });
  });

  describe('verifyAny()', () => {
    it('returns payment verification when the id is a payment', async () => {
      const result = await controller.verifyAny('pay-1');
      expect(result.kind).toBe('payment');
      expect(mockService.loadPaymentVerification).toHaveBeenCalledWith('pay-1');
    });

    it('falls back to refund verification when payment is not found', async () => {
      mockService.loadPaymentVerification.mockRejectedValueOnce(
        new NotFoundException(),
      );

      const result = await controller.verifyAny('ref-1');
      expect(result.kind).toBe('refund');
      expect(mockService.loadRefundVerification).toHaveBeenCalledWith('ref-1');
    });
  });
});
