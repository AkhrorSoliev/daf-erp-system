import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { ReceiptsService } from './receipts.service';

/**
 * All routes are public — the UUID in the path is the access token.
 * UUIDs are unguessable, and the receipt content is meant to be shared
 * with the student anyway (the link is sent to their Telegram). Rate
 * limiting can be layered at the gateway / nginx side if abuse appears.
 *
 * The QR code on a paper receipt points to `/r/<id>` (frontend route);
 * the verification endpoint here is what that page fetches.
 */
@Controller('receipts')
export class ReceiptsController {
  constructor(private receiptsService: ReceiptsService) {}

  @Public()
  @Get('payment/:id.pdf')
  async downloadPayment(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.receiptsService.generatePaymentPdf(id);
    sendPdf(res, buffer, `kvitansiya-${id}.pdf`);
  }

  @Public()
  @Get('refund/:id.pdf')
  async downloadRefund(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.receiptsService.generateRefundPdf(id);
    sendPdf(res, buffer, `qaytarish-${id}.pdf`);
  }

  @Public()
  @Get('payment/:id/verify')
  verifyPayment(@Param('id') id: string) {
    return this.receiptsService.loadPaymentVerification(id);
  }

  @Public()
  @Get('refund/:id/verify')
  verifyRefund(@Param('id') id: string) {
    return this.receiptsService.loadRefundVerification(id);
  }

  /**
   * Auto-detection endpoint: the QR code can encode the bare id
   * (whether it's a payment or refund), and this resolves which kind it
   * is so the frontend `/r/[id]` page only needs one fetch.
   */
  @Public()
  @Get(':id/verify')
  async verifyAny(@Param('id') id: string) {
    try {
      return await this.receiptsService.loadPaymentVerification(id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return this.receiptsService.loadRefundVerification(id);
      }
      throw err;
    }
  }
}

function sendPdf(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}
