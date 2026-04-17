import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Faol',
  INACTIVE: 'Nofaol',
  SUSPENDED: "To'xtatilgan",
  TERMINATED: "Ishdan bo'shatilgan",
  ARCHIVED: 'Arxivlangan',
  FROZEN: 'Muzlatilgan',
  GRADUATED: 'Bitirgan',
  EXPELLED: 'Chetlatilgan',
  FORMING: 'Shakllanmoqda',
  COMPLETED: 'Tugallangan',
  CANCELLED: 'Bekor qilingan',
  NEW: 'Yangi',
  CONTACTED: "Bog'lanildi",
  CONVERTED: "O'quvchiga aylandi",
  LOST: "Yo'qolgan",
  CLOSED: 'Yopilgan',
  UNDER_MAINTENANCE: "Ta'mirda",
  DEPRECATED: 'Eskirgan',
  DROPPED: 'Tark etgan',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

@Injectable()
export class CommentEventsListener {
  private readonly logger = new Logger(CommentEventsListener.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('entity.status.changed')
  async handleStatusChanged(payload: {
    entityType: string;
    entityId: string;
    oldStatus?: string;
    newStatus?: string;
    reason?: string;
    changedById?: number;
    companyId?: number;
  }) {
    const {
      entityType,
      entityId,
      oldStatus,
      newStatus,
      reason,
      changedById,
      companyId,
    } = payload;

    if (!oldStatus || !newStatus || !changedById) return;

    // Only create system comments for entity types that support comments
    const supportedTypes = ['Student', 'User', 'Group'];
    if (!supportedTypes.includes(entityType)) return;

    try {
      let content = `Status o'zgartirildi: ${statusLabel(oldStatus)} → ${statusLabel(newStatus)}`;
      if (reason) {
        content += `\nSabab: ${reason}`;
      }

      await this.prisma.comment.create({
        data: {
          entityType,
          entityId: String(entityId),
          content,
          isTask: false,
          isSystem: true,
          authorId: changedById,
          companyId: companyId ?? 0,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create system comment for ${entityType}/${entityId}: ${error.message}`,
      );
    }
  }
}
