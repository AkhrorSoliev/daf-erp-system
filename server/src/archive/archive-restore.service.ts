import { Injectable, NotFoundException } from '@nestjs/common';
import {
  UserStatus,
  StudentStatus,
  GroupStatus,
  CourseStatus,
  BranchStatus,
  RoomStatus,
  LeadStatus,
  EnrollmentStatus,
  HolidayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ArchiveEntityType } from './dto/archive-query.dto';
import {
  ENTITY_DEFAULT_STATUS,
  ENTITY_TYPE_MAP,
  companyScope,
  getDelegate,
  getStatusField,
  parseId,
} from './shared/archive-meta';

@Injectable()
export class ArchiveRestoreService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async restore(
    entityType: ArchiveEntityType,
    id: string | number,
    userId: number,
    companyId: number,
  ) {
    const delegate = getDelegate(this.prisma, entityType);
    const parsedId = parseId(entityType, id);

    const record = await delegate.findFirst({
      where: {
        id: parsedId,
        deletedAt: { not: null },
        ...companyScope(entityType, companyId),
      },
    });

    if (!record) {
      throw new NotFoundException(`Arxivda ${entityType}/${id} topilmadi`);
    }

    const statusField = getStatusField(entityType);
    const defaultStatus = ENTITY_DEFAULT_STATUS[entityType];
    const historyEntityType = ENTITY_TYPE_MAP[entityType];

    // Agar deletionBatchId bo'lsa, barcha bog'liq yozuvlarni ham tiklaymiz
    if (record.deletionBatchId) {
      await this.restoreBatch(record.deletionBatchId, userId);
    } else {
      // StatusHistory yozish (faqat status o'zgarsa)
      const currentStatus = record[statusField];
      if (
        currentStatus &&
        currentStatus !== defaultStatus &&
        historyEntityType
      ) {
        await this.statusHistoryService.changeStatus({
          entityType: historyEntityType,
          entityId: String(parsedId),
          fromStatus: currentStatus,
          toStatus: defaultStatus,
          reason: 'Arxivdan tiklandi',
          changedById: userId,
          companyId: record.companyId ?? undefined,
        });
      }

      const restoreData: any = {
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: 'Arxivdan tiklandi',
      };
      restoreData[statusField] = defaultStatus;

      // isActive ni ham restore qilish
      if ('isActive' in record) {
        restoreData.isActive = true;
      }

      await delegate.update({
        where: { id: parsedId },
        data: restoreData,
      });
    }

    if (historyEntityType) {
      await this.entityHistoryService.recordRestore({
        entityType: historyEntityType,
        entityId: parsedId,
        newValues: { status: defaultStatus },
        changedById: userId,
        companyId: record.companyId ?? undefined,
      });
    }

    return { message: `${entityType} muvaffaqiyatli tiklandi` };
  }

  private async restoreBatch(batchId: string, userId?: number) {
    const now = new Date();
    const restoreBase = {
      deletedAt: null,
      deletedById: null,
      deletionBatchId: null,
      statusChangedAt: now,
      statusChangedById: userId ?? null,
      statusChangeReason: 'Arxivdan tiklandi (batch)',
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: EnrollmentStatus.ACTIVE },
      });
      await tx.group.updateMany({
        where: { deletionBatchId: batchId },
        data: {
          ...restoreBase,
          statusEnum: GroupStatus.FORMING,
          isActive: true,
        },
      });
      await tx.room.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: RoomStatus.ACTIVE },
      });
      await tx.course.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: CourseStatus.ACTIVE, isActive: true },
      });
      await tx.branch.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: BranchStatus.ACTIVE, isActive: true },
      });
      await tx.student.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: StudentStatus.ACTIVE, isActive: true },
      });
      await tx.lead.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, statusEnum: LeadStatus.NEW },
      });
      await tx.user.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: UserStatus.ACTIVE, isActive: true },
      });
      await tx.holiday.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: HolidayStatus.ACTIVE },
      });
    });
  }
}
