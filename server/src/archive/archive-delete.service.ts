import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ArchiveEntityType } from './dto/archive-query.dto';
import { companyScope, getDelegate, parseId } from './shared/archive-meta';

@Injectable()
export class ArchiveDeleteService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async permanentDelete(
    entityType: ArchiveEntityType,
    id: string | number,
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

    // Fayllarni Cloudflare R2 dan o'chirish
    await this.deleteFiles(entityType, record);

    // Batch bo'lsa — bog'liq yozuvlarni ham o'chirish
    if (record.deletionBatchId) {
      await this.permanentDeleteBatch(record.deletionBatchId);
    } else {
      // Cascade bog'liqliklarni o'chirish (UserRole, UserBranch, etc.)
      if (entityType === ArchiveEntityType.USERS) {
        await this.prisma.userRole.deleteMany({
          where: { userId: parsedId as number },
        });
        await this.prisma.userBranch.deleteMany({
          where: { userId: parsedId as number },
        });
      }
      await delegate.delete({ where: { id: parsedId } });
    }

    return { message: `${entityType} butunlay o'chirildi` };
  }

  private async deleteFiles(entityType: ArchiveEntityType, record: any) {
    // User — photo
    if (entityType === ArchiveEntityType.USERS && record.photo) {
      await this.uploadService.deleteFile(record.photo);
    }
    // Student — photo
    if (entityType === ArchiveEntityType.STUDENTS && record.photo) {
      await this.uploadService.deleteFile(record.photo);
    }
  }

  private async permanentDeleteBatch(batchId: string) {
    // Batch dagi barcha fayllarni o'chirish
    const users = await this.prisma.user.findMany({
      where: { deletionBatchId: batchId },
      select: { id: true, photo: true },
    });
    const students = await this.prisma.student.findMany({
      where: { deletionBatchId: batchId },
      select: { id: true, photo: true },
    });

    for (const u of users) {
      if (u.photo) await this.uploadService.deleteFile(u.photo);
    }
    for (const s of students) {
      if (s.photo) await this.uploadService.deleteFile(s.photo);
    }

    // DB dan o'chirish (tartib: child → parent)
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.deleteMany({ where: { deletionBatchId: batchId } });

      // User larning join tablalarini tozalash
      for (const u of users) {
        await tx.userRole.deleteMany({ where: { userId: u.id } });
        await tx.userBranch.deleteMany({ where: { userId: u.id } });
      }

      await tx.group.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.room.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.student.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.lead.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.user.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.course.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.branch.deleteMany({ where: { deletionBatchId: batchId } });
      await tx.holiday.deleteMany({ where: { deletionBatchId: batchId } });
    });
  }
}
