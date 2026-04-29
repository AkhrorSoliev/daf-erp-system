import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { GroupQueryDto } from './dto/group-query.dto';
import { Prisma } from '@prisma/client';
import { groupInclude, formatGroup } from './shared/group-include';

@Injectable()
export class GroupsReadService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
  ) {}

  async findAll(query: GroupQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.GroupWhereInput = {
      deletedAt: null,
      companyId,
    };

    if (query.branch_id) {
      where.branchId = query.branch_id;
    }

    if (query.statusEnum) {
      where.statusEnum = query.statusEnum as any;
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    if (query.teacher_id) {
      where.teachers = { some: { teacherId: query.teacher_id } };
    }

    if (query.room_id) {
      where.roomId = query.room_id;
    }

    if (query.level) {
      where.level = query.level;
    }

    if (query.course_type === 'intensive') {
      where.course = { lessonPaymentCount: 20 };
    } else if (query.course_type === 'standard') {
      where.course = { lessonPaymentCount: { not: 20 } };
    }

    // baseWhere = filters without status (for stats)
    const baseWhere: Prisma.GroupWhereInput = { ...where };
    delete baseWhere.status;
    delete baseWhere.statusEnum;

    const [
      data,
      total,
      statsTotal,
      activeCount,
      formingCount,
      pausedCount,
      completedCount,
    ] = await Promise.all([
      this.prisma.group.findMany({
        where,
        include: groupInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.group.count({ where }),
      this.prisma.group.count({ where: baseWhere }),
      this.prisma.group.count({
        where: { ...baseWhere, statusEnum: 'ACTIVE' },
      }),
      this.prisma.group.count({
        where: { ...baseWhere, statusEnum: 'FORMING' },
      }),
      this.prisma.group.count({
        where: { ...baseWhere, statusEnum: 'PAUSED' },
      }),
      this.prisma.group.count({
        where: { ...baseWhere, statusEnum: 'COMPLETED' },
      }),
    ]);

    return {
      data: data.map(formatGroup),
      total,
      page,
      pageSize,
      stats: {
        total: statsTotal,
        active: activeCount,
        forming: formingCount,
        paused: pausedCount,
        completed: completedCount,
      },
    };
  }

  async getNextName(branchId: number, companyId: number) {
    const maxGroupNumber = await this.prisma.group.aggregate({
      where: {
        branchId,
        name: { startsWith: '#' },
        deletedAt: null,
        companyId,
      },
      _max: { groupNumber: true },
    });
    const nextNumber = (maxGroupNumber._max?.groupNumber ?? 0) + 1;
    return { nextName: `#${String(nextNumber).padStart(3, '0')}` };
  }

  async findStudentsByGroupId(groupId: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, companyId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${groupId} topilmadi`);
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: 'ACTIVE',
        student: { deletedAt: null },
      },
      select: {
        id: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photo: true,
            balance: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.createdAt,
      ...e.student,
    }));
  }

  async findOne(id: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId },
      include: groupInclude,
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    return formatGroup(group);
  }

  async getStatusHistory(id: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`Guruh #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Group', id);
  }
}
