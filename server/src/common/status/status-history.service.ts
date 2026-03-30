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
    const { entityType, entityId, fromStatus, toStatus, reason, changedById, companyId } = params;

    if (fromStatus === toStatus) {
      throw new BadRequestException(`Status allaqachon "${toStatus}"`);
    }

    if (!isValidTransition(entityType, fromStatus, toStatus)) {
      const allowed = getAllowedTransitions(entityType, fromStatus);
      throw new BadRequestException(
        `"${fromStatus}" dan "${toStatus}" ga o'tish mumkin emas. Ruxsat etilgan: ${allowed.join(', ') || 'yo\'q'}`,
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

  async recordInitialStatus(params: {
    entityType: string;
    entityId: string;
    status: string;
    changedById?: number;
    companyId?: number;
  }) {
    await this.prisma.statusHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        fromStatus: null,
        toStatus: params.status,
        reason: 'Yaratildi',
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
  }

  async getHistory(entityType: string, entityId: string) {
    return this.prisma.statusHistory.findMany({
      where: {
        entityType,
        entityId: String(entityId),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: {
          select: { id: true, name: true },
        },
      },
    });
  }
}
