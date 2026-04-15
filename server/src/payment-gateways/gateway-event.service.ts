import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Persists raw gateway webhook payloads to PaymentGatewayEvent before any
 * business processing. This log is the source of truth for disputes, replay,
 * debugging, and duplicate detection — it survives even if signature
 * validation fails or downstream payment creation throws.
 */
@Injectable()
export class GatewayEventService {
  constructor(private prisma: PrismaService) {}

  async record(params: {
    provider: PaymentMethod;
    externalId: string;
    eventType: string;
    payload: Prisma.JsonObject;
    signatureValid: boolean;
    companyId: number;
    errorMessage?: string;
  }) {
    return this.prisma.paymentGatewayEvent.create({
      data: {
        provider: params.provider,
        externalId: params.externalId,
        eventType: params.eventType,
        payload: params.payload,
        signatureValid: params.signatureValid,
        processed: false,
        companyId: params.companyId,
        errorMessage: params.errorMessage,
      },
    });
  }

  async markProcessed(id: string) {
    return this.prisma.paymentGatewayEvent.update({
      where: { id },
      data: { processed: true, processedAt: new Date() },
    });
  }

  async markFailed(id: string, errorMessage: string) {
    return this.prisma.paymentGatewayEvent.update({
      where: { id },
      data: { errorMessage, processedAt: new Date() },
    });
  }
}
