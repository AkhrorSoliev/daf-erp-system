import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  UserStatus, StudentStatus, GroupStatus, CourseStatus,
  BranchStatus, RoomStatus, LeadStatus, EnrollmentStatus, HolidayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status';
import { ArchiveEntityType, ArchiveQueryDto } from './dto/archive-query.dto';

const ENTITY_DEFAULT_STATUS: Record<string, string> = {
  [ArchiveEntityType.USERS]: UserStatus.ACTIVE,
  [ArchiveEntityType.STUDENTS]: StudentStatus.ACTIVE,
  [ArchiveEntityType.GROUPS]: GroupStatus.FORMING,
  [ArchiveEntityType.COURSES]: CourseStatus.ACTIVE,
  [ArchiveEntityType.BRANCHES]: BranchStatus.ACTIVE,
  [ArchiveEntityType.ROOMS]: RoomStatus.ACTIVE,
  [ArchiveEntityType.LEADS]: LeadStatus.NEW,
  [ArchiveEntityType.ENROLLMENTS]: EnrollmentStatus.ACTIVE,
  [ArchiveEntityType.HOLIDAYS]: HolidayStatus.ACTIVE,
};

const ENTITY_TYPE_MAP: Record<string, string> = {
  [ArchiveEntityType.USERS]: 'User',
  [ArchiveEntityType.STUDENTS]: 'Student',
  [ArchiveEntityType.GROUPS]: 'Group',
  [ArchiveEntityType.COURSES]: 'Course',
  [ArchiveEntityType.BRANCHES]: 'Branch',
  [ArchiveEntityType.ROOMS]: 'Room',
  [ArchiveEntityType.LEADS]: 'Lead',
  [ArchiveEntityType.ENROLLMENTS]: 'Enrollment',
  [ArchiveEntityType.HOLIDAYS]: 'Holiday',
};

@Injectable()
export class ArchiveService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private statusHistoryService: StatusHistoryService,
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

    const statusField = this.getStatusField(entityType);
    const defaultStatus = ENTITY_DEFAULT_STATUS[entityType];
    const historyEntityType = ENTITY_TYPE_MAP[entityType];

    // Agar deletionBatchId bo'lsa, barcha bog'liq yozuvlarni ham tiklaymiz
    if (record.deletionBatchId) {
      await this.restoreBatch(record.deletionBatchId, userId);
    } else {
      // StatusHistory yozish
      if (record[statusField] && historyEntityType) {
        await this.statusHistoryService.changeStatus({
          entityType: historyEntityType,
          entityId: String(parsedId),
          fromStatus: record[statusField],
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

  async archiveBranch(id: number, userId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();
    const archiveData = {
      deletedAt: now, deletedById: userId, deletionBatchId: batchId,
      statusChangedAt: now, statusChangedById: userId,
      statusChangeReason: `Filial #${id} arxivlandi`,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { group: { branchId: id }, deletedAt: null },
        data: { ...archiveData, status: EnrollmentStatus.DROPPED },
      });
      await tx.group.updateMany({
        where: { branchId: id, deletedAt: null },
        data: { ...archiveData, statusEnum: GroupStatus.ARCHIVED, isActive: false },
      });
      await tx.room.updateMany({
        where: { branchId: id, deletedAt: null },
        data: { ...archiveData, status: RoomStatus.ARCHIVED },
      });
      await tx.branch.update({
        where: { id },
        data: { ...archiveData, status: BranchStatus.ARCHIVED, isActive: false },
      });
    });

    // StatusHistory for the branch itself
    await this.statusHistoryService.changeStatus({
      entityType: 'Branch',
      entityId: String(id),
      fromStatus: branch.status,
      toStatus: BranchStatus.ARCHIVED,
      reason: "Arxivlandi",
      changedById: userId,
      companyId: branch.companyId ?? undefined,
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
    const archiveData = {
      deletedAt: now, deletedById: userId, deletionBatchId: batchId,
      statusChangedAt: now, statusChangedById: userId,
      statusChangeReason: `Kurs arxivlandi`,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { group: { courseId: id }, deletedAt: null },
        data: { ...archiveData, status: EnrollmentStatus.DROPPED },
      });
      await tx.group.updateMany({
        where: { courseId: id, deletedAt: null },
        data: { ...archiveData, statusEnum: GroupStatus.ARCHIVED, isActive: false },
      });
      await tx.course.update({
        where: { id },
        data: { ...archiveData, status: CourseStatus.ARCHIVED, isActive: false },
      });
    });

    await this.statusHistoryService.changeStatus({
      entityType: 'Course',
      entityId: id,
      fromStatus: course.status,
      toStatus: CourseStatus.ARCHIVED,
      reason: "Arxivlandi",
      changedById: userId,
      companyId: course.companyId ?? undefined,
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
    const archiveData = {
      deletedAt: now, deletedById: userId, deletionBatchId: batchId,
      statusChangedAt: now, statusChangedById: userId,
      statusChangeReason: `Guruh arxivlandi`,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { groupId: id, deletedAt: null },
        data: { ...archiveData, status: EnrollmentStatus.DROPPED },
      });
      await tx.group.update({
        where: { id },
        data: { ...archiveData, statusEnum: GroupStatus.ARCHIVED, isActive: false },
      });
    });

    await this.statusHistoryService.changeStatus({
      entityType: 'Group',
      entityId: id,
      fromStatus: group.statusEnum,
      toStatus: GroupStatus.ARCHIVED,
      reason: "Arxivlandi",
      changedById: userId,
      companyId: group.companyId ?? undefined,
    });

    return { message: "Guruh muvaffaqiyatli o'chirildi" };
  }

  async archiveStudent(id: number, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
    });
    if (!student) {
      throw new NotFoundException(`Talaba #${id} topilmadi`);
    }

    const batchId = randomUUID();
    const now = new Date();
    const archiveData = {
      deletedAt: now, deletedById: userId, deletionBatchId: batchId,
      statusChangedAt: now, statusChangedById: userId,
      statusChangeReason: `Talaba arxivlandi`,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { studentId: id, deletedAt: null },
        data: { ...archiveData, status: EnrollmentStatus.DROPPED },
      });
      await tx.student.update({
        where: { id },
        data: { ...archiveData, status: StudentStatus.ARCHIVED, isActive: false },
      });
    });

    await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: StudentStatus.ARCHIVED,
      reason: "Arxivlandi",
      changedById: userId,
      companyId: student.companyId ?? undefined,
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

    const statusField = this.getStatusField(entityType);
    const historyEntityType = ENTITY_TYPE_MAP[entityType];
    const archivedStatus = this.getArchivedStatus(entityType);

    // StatusHistory yozish
    if (record[statusField] && historyEntityType) {
      await this.statusHistoryService.changeStatus({
        entityType: historyEntityType,
        entityId: String(parsedId),
        fromStatus: record[statusField],
        toStatus: archivedStatus,
        reason: "Arxivlandi",
        changedById: userId,
        companyId: record.companyId ?? undefined,
      });
    }

    const data: any = {
      deletedAt: new Date(),
      deletedById: userId,
      statusChangedAt: new Date(),
      statusChangedById: userId,
      statusChangeReason: "Arxivlandi",
    };
    data[statusField] = archivedStatus;

    if ('isActive' in record) {
      data.isActive = false;
    }

    await delegate.update({
      where: { id: parsedId },
      data,
    });

    return { message: `${entityType} muvaffaqiyatli o'chirildi` };
  }

  private async restoreBatch(batchId: string, userId?: number) {
    const now = new Date();
    const restoreBase = {
      deletedAt: null, deletedById: null, deletionBatchId: null,
      statusChangedAt: now, statusChangedById: userId ?? null,
      statusChangeReason: 'Arxivdan tiklandi (batch)',
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, status: EnrollmentStatus.ACTIVE },
      });
      await tx.group.updateMany({
        where: { deletionBatchId: batchId },
        data: { ...restoreBase, statusEnum: GroupStatus.FORMING, isActive: true },
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

  private getStatusField(entityType: ArchiveEntityType): string {
    if (entityType === ArchiveEntityType.GROUPS) return 'statusEnum';
    if (entityType === ArchiveEntityType.LEADS) return 'statusEnum';
    return 'status';
  }

  private getArchivedStatus(entityType: ArchiveEntityType): string {
    const map: Record<string, string> = {
      [ArchiveEntityType.USERS]: UserStatus.ARCHIVED,
      [ArchiveEntityType.STUDENTS]: StudentStatus.ARCHIVED,
      [ArchiveEntityType.GROUPS]: GroupStatus.ARCHIVED,
      [ArchiveEntityType.COURSES]: CourseStatus.ARCHIVED,
      [ArchiveEntityType.BRANCHES]: BranchStatus.ARCHIVED,
      [ArchiveEntityType.ROOMS]: RoomStatus.ARCHIVED,
      [ArchiveEntityType.LEADS]: LeadStatus.ARCHIVED,
      [ArchiveEntityType.ENROLLMENTS]: EnrollmentStatus.DROPPED,
      [ArchiveEntityType.HOLIDAYS]: HolidayStatus.CANCELLED,
    };
    return map[entityType] || 'ARCHIVED';
  }

  private parseId(entityType: ArchiveEntityType, id: string | number) {
    // User, Branch va Student int ID ishlatadi
    if (
      entityType === ArchiveEntityType.USERS ||
      entityType === ArchiveEntityType.BRANCHES ||
      entityType === ArchiveEntityType.STUDENTS
    ) {
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
