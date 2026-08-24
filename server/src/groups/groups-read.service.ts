import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { GroupQueryDto } from './dto/group-query.dto';
import { Prisma } from '@prisma/client';
import { groupInclude, formatGroup } from './shared/group-include';
import { computeNextGroupNumber } from './shared/next-group-number';
import { STUDENT_ROSTER_ORDER_BY } from '../common/student-roster-order';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';

@Injectable()
export class GroupsReadService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
  ) {}

  async findAll(
    query: GroupQueryDto,
    companyId: number,
    scope: ReportBranchIds,
    /**
     * The caller's own id when they are a teacher looking at their own list.
     * Server-decided — see `groups.controller.ts`.
     */
    selfScopedTeacherId?: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // From the resolved request scope, not `query.branch_id`. The raw parameter
    // never confined anyone: omitted it listed every branch's groups, and a
    // foreign id listed that branch's.
    const where: Prisma.GroupWhereInput = {
      deletedAt: null,
      companyId,
      ...branchIdWhere(scope),
    };

    if (query.statusEnum) {
      where.statusEnum = query.statusEnum as any;
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      // Search matches the group name OR a teacher's first/last name, so an
      // admin can find a group by who teaches it. Multi-word terms ("Ali
      // Valiyev") are split into tokens; every token must match somewhere
      // (the name or a teacher) so the result narrows as more is typed.
      const tokens = query.search.trim().split(/\s+/);
      where.AND = tokens.map((token) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' } },
          {
            teachers: {
              some: {
                teacher: {
                  OR: [
                    { firstName: { contains: token, mode: 'insensitive' } },
                    { lastName: { contains: token, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      }));
    }

    if (query.teacher_id) {
      where.teachers = { some: { teacherId: query.teacher_id } };
    }

    // A teacher looking at their OWN list: groups they are assigned to, plus
    // groups they were asked to cover. The second half is why a substitute can
    // find the lesson they taught; without it the guard admits them to a group
    // they have no way to navigate to.
    if (selfScopedTeacherId) {
      const mine = { teachers: { some: { teacherId: selfScopedTeacherId } } };
      const covering = {
        lessonTeacherOverrides: {
          some: {
            teacherIds: { has: selfScopedTeacherId },
            deletedAt: null,
          },
        },
      };
      where.AND = [
        ...((where.AND as object[]) ?? []),
        { OR: [mine, covering] },
      ];
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

    // Filtr dropdownlari uchun JAMI sonlar — faqat filialga bog'liq, boshqa
    // faol filtrlarga (holat/daraja/xona/o'qituvchi/qidiruv/tur) bog'liq EMAS,
    // shunda har bir variant yonidagi son barqaror qoladi (o'quvchilar
    // sahifasidagi daraja sanog'i bilan bir xil yondashuv).
    const branchScope: Prisma.GroupWhereInput = {
      deletedAt: null,
      companyId,
      ...branchIdWhere(scope),
    };

    const [
      data,
      total,
      statsTotal,
      activeCount,
      formingCount,
      pausedCount,
      completedCount,
      statusGroups,
      levelGroups,
      roomGroups,
      intensiveCount,
      standardCount,
      teacherGroups,
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
      this.prisma.group.groupBy({
        by: ['statusEnum'],
        where: branchScope,
        _count: { _all: true },
      }),
      this.prisma.group.groupBy({
        by: ['level'],
        where: branchScope,
        _count: { _all: true },
      }),
      this.prisma.group.groupBy({
        by: ['roomId'],
        where: branchScope,
        _count: { _all: true },
      }),
      this.prisma.group.count({
        where: { ...branchScope, course: { lessonPaymentCount: 20 } },
      }),
      this.prisma.group.count({
        where: { ...branchScope, course: { lessonPaymentCount: { not: 20 } } },
      }),
      this.prisma.groupTeacher.groupBy({
        by: ['teacherId'],
        where: { group: branchScope },
        _count: { _all: true },
      }),
    ]);

    const GROUP_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const statusCountMap: Record<string, number> = {};
    for (const g of statusGroups) {
      if (g.statusEnum) statusCountMap[g.statusEnum] = g._count._all;
    }
    const levelCountMap: Record<string, number> = {};
    for (const g of levelGroups) {
      if (g.level) levelCountMap[g.level] = g._count._all;
    }
    const roomCounts: Record<string, number> = {};
    for (const g of roomGroups) {
      if (g.roomId != null) roomCounts[String(g.roomId)] = g._count._all;
    }
    const teacherCounts: Record<string, number> = {};
    for (const t of teacherGroups) {
      teacherCounts[String(t.teacherId)] = t._count._all;
    }
    const levelCounts: Record<string, number> = {};
    for (const lvl of GROUP_LEVELS) levelCounts[lvl] = levelCountMap[lvl] ?? 0;

    // Which of these groups is this teacher only COVERING, and on which days.
    // Without it the substituted group sits in their list looking exactly like
    // one of their own, with no answer to "why is this here?" or "which day is
    // mine?". Only computed for a teacher's own list — nobody else's view has
    // a "you" to be covering.
    const coveringByGroup = new Map<string, string[]>();
    if (selfScopedTeacherId && data.length > 0) {
      const covers = await this.prisma.lessonTeacherOverride.findMany({
        where: {
          groupId: { in: data.map((g) => g.id) },
          deletedAt: null,
          teacherIds: { has: selfScopedTeacherId },
        },
        select: { groupId: true, date: true },
        orderBy: { date: 'asc' },
      });
      for (const c of covers) {
        const list = coveringByGroup.get(c.groupId) ?? [];
        list.push(tashkentDateStr(c.date));
        coveringByGroup.set(c.groupId, list);
      }
    }

    return {
      data: data.map((g) => ({
        ...formatGroup(g),
        /** Lesson dates this teacher is covering. Empty for their own groups. */
        coveringDates: coveringByGroup.get(g.id) ?? [],
      })),
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
      filterCounts: {
        status: {
          ACTIVE: statusCountMap.ACTIVE ?? 0,
          FORMING: statusCountMap.FORMING ?? 0,
          PAUSED: statusCountMap.PAUSED ?? 0,
          COMPLETED: statusCountMap.COMPLETED ?? 0,
        },
        level: levelCounts,
        courseType: { standard: standardCount, intensive: intensiveCount },
        room: roomCounts,
        teacher: teacherCounts,
      },
    };
  }

  async getNextName(branchId: number, _companyId: number) {
    const nextNumber = await computeNextGroupNumber(this.prisma, branchId);
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
      orderBy: STUDENT_ROSTER_ORDER_BY,
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.createdAt,
      ...e.student,
    }));
  }

  async findOne(id: string, companyId: number, scope: ReportBranchIds) {
    // Branch-confined as well as company-confined: the group detail page is
    // reachable by id from search, a teacher profile or a pasted link, and it
    // carries the full student roster.
    const group = await this.prisma.group.findFirst({
      where: { id, deletedAt: null, companyId, ...branchIdWhere(scope) },
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
