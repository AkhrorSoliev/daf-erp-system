import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ArchiveEntityType, ArchiveQueryDto } from './dto/archive-query.dto';

@Injectable()
export class ArchiveService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async getCounts() {
    const deletedFilter = { deletedAt: { not: null } };
    const [users, branches, rooms, courses, students, leads, groups, enrollments, holidays] =
      await Promise.all([
        this.prisma.user.count({ where: deletedFilter }),
        this.prisma.branch.count({ where: deletedFilter }),
        this.prisma.room.count({ where: deletedFilter }),
        this.prisma.course.count({ where: deletedFilter }),
        this.prisma.student.count({ where: deletedFilter }),
        this.prisma.lead.count({ where: deletedFilter }),
        this.prisma.group.count({ where: deletedFilter }),
        this.prisma.enrollment.count({ where: deletedFilter }),
        this.prisma.holiday.count({ where: deletedFilter }),
      ]);
    return { users, branches, rooms, courses, students, leads, groups, enrollments, holidays };
  }

  async findAll(entityType: ArchiveEntityType, query: ArchiveQueryDto) {
    const { page = 1, per_page = 10, search } = query;
    const skip = (page - 1) * per_page;

    const delegate = this.getDelegate(entityType);
    const where: any = { deletedAt: { not: null } };

    if (search) {
      const searchFilter = this.getSearchFilter(entityType, search);
      Object.assign(where, searchFilter);
    }

    const include = this.getInclude(entityType);

    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take: per_page,
        orderBy: { deletedAt: 'desc' },
        ...(include && { include }),
      }),
      delegate.count({ where }),
    ]);

    return { data, total, page, per_page };
  }

  async findOne(entityType: ArchiveEntityType, id: string | number) {
    const delegate = this.getDelegate(entityType);
    const include = this.getInclude(entityType);
    const parsedId = this.parseId(entityType, id);

    const record = await delegate.findFirst({
      where: { id: parsedId, deletedAt: { not: null } },
      ...(include && { include }),
    });

    if (!record) {
      throw new NotFoundException(`Arxivda ${entityType}/${id} topilmadi`);
    }

    return record;
  }

  async restore(entityType: ArchiveEntityType, id: string | number, userId: number) {
    const delegate = this.getDelegate(entityType);
    const parsedId = this.parseId(entityType, id);

    const record = await delegate.findFirst({
      where: { id: parsedId, deletedAt: { not: null } },
    });

    if (!record) {
      throw new NotFoundException(`Arxivda ${entityType}/${id} topilmadi`);
    }

    // Agar deletionBatchId bo'lsa, barcha bog'liq yozuvlarni ham tiklaymiz
    if (record.deletionBatchId) {
      await this.restoreBatch(record.deletionBatchId);
    } else {
      await delegate.update({
        where: { id: parsedId },
        data: { deletedAt: null, deletedById: null, deletionBatchId: null },
      });
    }

    return { message: `${entityType} muvaffaqiyatli tiklandi` };
  }

  async permanentDelete(entityType: ArchiveEntityType, id: string | number) {
    const delegate = this.getDelegate(entityType);
    const parsedId = this.parseId(entityType, id);

    const record = await delegate.findFirst({
      where: { id: parsedId, deletedAt: { not: null } },
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
        await this.prisma.userRole.deleteMany({ where: { userId: parsedId as number } });
        await this.prisma.userBranch.deleteMany({ where: { userId: parsedId as number } });
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
    // Student — avatar
    if (entityType === ArchiveEntityType.STUDENTS && record.avatar) {
      await this.uploadService.deleteFile(record.avatar);
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
      select: { id: true, avatar: true },
    });

    for (const u of users) {
      if (u.photo) await this.uploadService.deleteFile(u.photo);
    }
    for (const s of students) {
      if (s.avatar) await this.uploadService.deleteFile(s.avatar);
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

  async archiveBranch(id: number, userId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Enrollment larni arxivlash (branch ga tegishli guruhlar orqali)
      await tx.enrollment.updateMany({
        where: { group: { branchId: id }, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      // Guruhlarni arxivlash
      await tx.group.updateMany({
        where: { branchId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      // Xonalarni arxivlash
      await tx.room.updateMany({
        where: { branchId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      // Branch ni arxivlash
      await tx.branch.update({
        where: { id },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
    });

    return { message: "Filial muvaffaqiyatli o'chirildi" };
  }

  async archiveCourse(id: string, userId: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { group: { courseId: id }, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      await tx.group.updateMany({
        where: { courseId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      await tx.course.update({
        where: { id },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
    });

    return { message: "Kurs muvaffaqiyatli o'chirildi" };
  }

  async archiveGroup(id: string, userId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null },
    });
    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { groupId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      await tx.group.update({
        where: { id },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
    });

    return { message: "Guruh muvaffaqiyatli o'chirildi" };
  }

  async archiveStudent(id: string, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
    });
    if (!student) {
      throw new NotFoundException(`Talaba #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { studentId: id, deletedAt: null },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
      await tx.student.update({
        where: { id },
        data: { deletedAt: now, deletedById: userId, deletionBatchId: batchId },
      });
    });

    return { message: "Talaba muvaffaqiyatli o'chirildi" };
  }

  async archiveSimple(entityType: ArchiveEntityType, id: string | number, userId: number) {
    const delegate = this.getDelegate(entityType);
    const parsedId = this.parseId(entityType, id);

    const record = await delegate.findFirst({
      where: { id: parsedId, deletedAt: null },
    });
    if (!record) {
      throw new NotFoundException(`${entityType}/${id} topilmadi`);
    }

    await delegate.update({
      where: { id: parsedId },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: `${entityType} muvaffaqiyatli o'chirildi` };
  }

  private async restoreBatch(batchId: string) {
    const restoreData = { deletedAt: null, deletedById: null, deletionBatchId: null };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.group.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.room.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.course.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.branch.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.student.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.lead.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.user.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
      await tx.holiday.updateMany({
        where: { deletionBatchId: batchId },
        data: restoreData,
      });
    });
  }

  private getDelegate(entityType: ArchiveEntityType) {
    const map: Record<ArchiveEntityType, any> = {
      [ArchiveEntityType.USERS]: this.prisma.user,
      [ArchiveEntityType.BRANCHES]: this.prisma.branch,
      [ArchiveEntityType.ROOMS]: this.prisma.room,
      [ArchiveEntityType.COURSES]: this.prisma.course,
      [ArchiveEntityType.STUDENTS]: this.prisma.student,
      [ArchiveEntityType.LEADS]: this.prisma.lead,
      [ArchiveEntityType.GROUPS]: this.prisma.group,
      [ArchiveEntityType.ENROLLMENTS]: this.prisma.enrollment,
      [ArchiveEntityType.HOLIDAYS]: this.prisma.holiday,
    };
    return map[entityType];
  }

  private getInclude(entityType: ArchiveEntityType) {
    const map: Partial<Record<ArchiveEntityType, any>> = {
      [ArchiveEntityType.USERS]: {
        roles: { include: { role: true } },
        branches: { include: { branch: { select: { id: true, name: true } } } },
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.BRANCHES]: {
        company: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.GROUPS]: {
        course: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.STUDENTS]: {
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.LEADS]: {
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.COURSES]: {
        company: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.ROOMS]: {
        branch: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
      [ArchiveEntityType.ENROLLMENTS]: {
        student: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
    };
    return map[entityType] || null;
  }

  private getSearchFilter(entityType: ArchiveEntityType, search: string) {
    switch (entityType) {
      case ArchiveEntityType.USERS:
        return { name: { contains: search, mode: 'insensitive' } };
      case ArchiveEntityType.BRANCHES:
        return { name: { contains: search, mode: 'insensitive' } };
      case ArchiveEntityType.COURSES:
        return { name: { contains: search, mode: 'insensitive' } };
      case ArchiveEntityType.STUDENTS:
        return {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        };
      case ArchiveEntityType.LEADS:
        return {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        };
      case ArchiveEntityType.GROUPS:
        return { name: { contains: search, mode: 'insensitive' } };
      case ArchiveEntityType.ROOMS:
        return { name: { contains: search, mode: 'insensitive' } };
      default:
        return {};
    }
  }

  private parseId(entityType: ArchiveEntityType, id: string | number) {
    // User va Branch int ID ishlatadi
    if (entityType === ArchiveEntityType.USERS || entityType === ArchiveEntityType.BRANCHES) {
      const parsed = typeof id === 'number' ? id : parseInt(id, 10);
      if (isNaN(parsed)) {
        throw new BadRequestException(`Noto'g'ri ID: ${id}`);
      }
      return parsed;
    }
    // Qolgan entitylar UUID ishlatadi
    return String(id);
  }
}
