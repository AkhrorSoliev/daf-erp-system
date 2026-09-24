import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
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
  STUDENT_ONLY_ACCOUNT,
  signInAccountChange,
} from '../common/auth/student-account';
import { loginForPhone } from '../common/auth/phone-account-rules';
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
      if (entityType === ArchiveEntityType.STUDENTS) {
        await this.assertNumberFreeForRestore(record);
      }

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

      if (entityType === ArchiveEntityType.STUDENTS) {
        // The card and its sign-in account come back together (ADR-0033).
        await this.prisma.$transaction(async (tx) => {
          await tx.student.update({
            where: { id: parsedId as number },
            data: restoreData,
          });
          await this.reopenStudentAccount(tx, record, userId);
        });
      } else {
        await delegate.update({
          where: { id: parsedId },
          data: restoreData,
        });
      }
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

  /**
   * A restored card must not share its number with a live card: that is the
   * rule `create` and `update` enforce, and a second live card on one number
   * makes sign-in pick between two students. Checked before anything is
   * written, so a refusal leaves the archive exactly as it was.
   */
  private async assertNumberFreeForRestore(card: {
    id: number;
    phone: string;
  }) {
    const holder = await this.prisma.student.findFirst({
      where: { phone: card.phone, deletedAt: null, id: { not: card.id } },
      select: { id: true },
    });
    if (holder) {
      throw new BadRequestException(
        `Bu kartaning telefon raqami hozir boshqa o'quvchida (#${holder.id}). ` +
          "Bitta raqamda ikkita o'quvchi bo'la olmaydi — avval o'sha kartadagi raqamni o'zgartiring.",
      );
    }
  }

  /**
   * Reopens the card's closed sign-in account (ADR-0033). The phone follows
   * the card and the login is the card phone unless another live account took
   * it while this one was closed (ADR-0022, ADR-0032) — writing it anyway
   * would break `User_login_key` and fail the whole restore. The password is
   * untouched. A card with no account gets none here; an account that was
   * never closed is left as it is.
   */
  private async reopenStudentAccount(
    tx: Prisma.TransactionClient,
    card: {
      id: number;
      phone: string;
      userId: number | null;
      companyId: number | null;
    },
    userId: number,
  ) {
    if (card.userId == null) return;
    const account = await tx.user.findFirst({
      where: {
        id: card.userId,
        deletedAt: { not: null },
        ...STUDENT_ONLY_ACCOUNT,
      },
      select: { id: true, login: true },
    });
    if (!account) return;

    const login = await loginForPhone(tx, card.phone);
    await tx.user.update({
      where: { id: account.id },
      data: {
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: 'Arxivdan tiklandi',
        phone: card.phone,
        login,
      },
    });

    const change = signInAccountChange('Yopildi', 'Ochiq');
    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: card.id,
      oldValues: { ...change.oldValues, login: account.login },
      newValues: { ...change.newValues, login },
      changedById: userId,
      companyId: card.companyId ?? undefined,
      tx,
    });
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
      // Capture enrollment IDs before update to write state log entries
      const restoredEnrollments = await tx.enrollment.findMany({
        where: { deletionBatchId: batchId },
        select: { id: true },
      });

      await tx.enrollment.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: EnrollmentStatus.ACTIVE },
      });

      if (restoredEnrollments.length > 0) {
        await tx.enrollmentStateLog.createMany({
          data: restoredEnrollments.map((e) => ({
            enrollmentId: e.id,
            status: EnrollmentStatus.ACTIVE,
            transitionAt: now,
            reason: 'Arxivdan tiklandi',
            changedById: userId ?? null,
          })),
        });
      }
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
      // No code archives a student card with a batch id today, so a student's
      // account never needs reopening here. A future batch archive of cards
      // must close and reopen their accounts the way `restore` does (ADR-0033).
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
