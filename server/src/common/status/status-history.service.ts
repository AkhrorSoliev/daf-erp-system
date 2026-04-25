import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidTransition, getAllowedTransitions } from './status-transitions';

interface ChangeStatusParams {
  entityType: string;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
}

@Injectable()
export class StatusHistoryService {
  constructor(private prisma: PrismaService) {}

  async changeStatus(params: ChangeStatusParams) {
    const {
      entityType,
      entityId,
      fromStatus,
      toStatus,
      reason,
      changedById,
      companyId,
    } = params;

    if (fromStatus === toStatus) {
      throw new BadRequestException(`Status allaqachon "${toStatus}"`);
    }

    if (!isValidTransition(entityType, fromStatus, toStatus)) {
      const allowed = getAllowedTransitions(entityType, fromStatus);
      throw new BadRequestException(
        `"${fromStatus}" dan "${toStatus}" ga o'tish mumkin emas. Ruxsat etilgan: ${allowed.join(', ') || "yo'q"}`,
      );
    }

    await this.prisma.statusHistory.create({
      data: {
        entityType,
        entityId: String(entityId),
        fromStatus,
        toStatus,
        reason,
        changedById,
        companyId,
      },
    });

    return {
      statusChangedAt: new Date(),
      statusChangedById: changedById,
      statusChangeReason: reason || null,
    };
  }

  async getHistory(entityType: string, entityId: string, companyId?: number) {
    return this.prisma.statusHistory.findMany({
      where: {
        entityType,
        entityId: String(entityId),
        // Defence-in-depth: callers are expected to verify the entity belongs
        // to their company before calling this — but if companyId is supplied
        // we apply it here too, so a bypass in a caller cannot leak history.
        ...(companyId != null && { companyId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
