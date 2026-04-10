import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EnrollmentStatus } from '@prisma/client';

export interface SearchItem {
  id: number | string;
  label: string;
  sublabel?: string | null;
  photo?: string | null;
  phone?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  balance?: number | null;
}

interface CategoryResult {
  items: SearchItem[];
  total: number;
}

export interface QuickSearchResult {
  students: CategoryResult;
  users: CategoryResult;
  teachers: CategoryResult;
  groups: CategoryResult;
  courses: CategoryResult;
}

export interface SearchContext {
  companyId: number;
  roles: string[];
  userId: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private prisma: PrismaService) {}

  async quickSearch(
    search: string,
    ctx: SearchContext,
  ): Promise<QuickSearchResult> {
    const start = Date.now();
    const trimmed = search.trim();
    const branchIds = await this.getUserBranchIds(ctx);

    const [students, users, teachers, groups, courses] = await Promise.all([
      this.searchStudents(trimmed, ctx.companyId, branchIds, 5),
      this.searchUsers(trimmed, ctx.companyId, branchIds, 5),
      this.searchTeachers(trimmed, ctx.companyId, branchIds, 5),
      this.searchGroups(trimmed, ctx.companyId, branchIds, 5),
      this.searchCourses(trimmed, ctx.companyId, branchIds, 5),
    ]);

    const elapsed = Date.now() - start;
    if (elapsed > 500) {
      this.logger.warn(
        `Global search took ${elapsed}ms for query "${trimmed}"`,
      );
    }

    return { students, users, teachers, groups, courses };
  }

  async fullSearch(
    search: string,
    ctx: SearchContext,
    type?: string,
    page: number = 1,
    pageSize: number = 10,
  ) {
    const trimmed = search.trim();
    const skip = (page - 1) * pageSize;
    const branchIds = await this.getUserBranchIds(ctx);
    const start = Date.now();

    let data: SearchItem[] = [];
    let total = 0;

    switch (type) {
      case 'students': {
        const where = this.buildStudentWhere(trimmed, ctx.companyId, branchIds);
        const [items, count] = await Promise.all([
          this.prisma.student.findMany({
            where,
            select: this.studentSelect,
            skip,
            take: pageSize,
            orderBy: { firstName: 'asc' },
          }),
          this.prisma.student.count({ where }),
        ]);
        data = this.sortByRelevance(
          items.map((s) => this.mapStudent(s)),
          trimmed,
        );
        total = count;
        break;
      }
      case 'users': {
        const where = this.buildUserWhere(trimmed, ctx.companyId, branchIds);
        const [items, count] = await Promise.all([
          this.prisma.user.findMany({
            where,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              photo: true,
              roles: { select: { role: { select: { name: true } } } },
            },
            skip,
            take: pageSize,
            orderBy: { firstName: 'asc' },
          }),
          this.prisma.user.count({ where }),
        ]);
        data = this.sortByRelevance(
          items.map((u) => ({
            id: u.id,
            label: `${u.firstName} ${u.lastName}`,
            sublabel: u.roles.map((r) => r.role.name).join(', '),
            phone: u.phone,
            photo: u.photo,
          })),
          trimmed,
        );
        total = count;
        break;
      }
      case 'teachers': {
        const where = this.buildTeacherWhere(trimmed, ctx.companyId, branchIds);
        const [items, count] = await Promise.all([
          this.prisma.user.findMany({
            where,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              photo: true,
            },
            skip,
            take: pageSize,
            orderBy: { firstName: 'asc' },
          }),
          this.prisma.user.count({ where }),
        ]);
        data = this.sortByRelevance(
          items.map((t) => ({
            id: t.id,
            label: `${t.firstName} ${t.lastName}`,
            phone: t.phone,
            photo: t.photo,
          })),
          trimmed,
        );
        total = count;
        break;
      }
      case 'groups': {
        const where = this.buildGroupWhere(trimmed, ctx.companyId, branchIds);
        const [items, count] = await Promise.all([
          this.prisma.group.findMany({
            where,
            select: { id: true, name: true, groupNumber: true },
            skip,
            take: pageSize,
            orderBy: { name: 'asc' },
          }),
          this.prisma.group.count({ where }),
        ]);
        data = items.map((g) => ({
          id: g.id,
          label: g.name,
          sublabel: g.groupNumber ? `#${g.groupNumber}` : undefined,
        }));
        total = count;
        break;
      }
      case 'courses': {
        const where = this.buildCourseWhere(trimmed, ctx.companyId, branchIds);
        const [items, count] = await Promise.all([
          this.prisma.course.findMany({
            where,
            select: { id: true, name: true },
            skip,
            take: pageSize,
            orderBy: { name: 'asc' },
          }),
          this.prisma.course.count({ where }),
        ]);
        data = items.map((c) => ({
          id: c.id,
          label: c.name,
        }));
        total = count;
        break;
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed > 500) {
      this.logger.warn(
        `Full search took ${elapsed}ms for query "${trimmed}" type="${type}"`,
      );
    }

    return { data, total, page, pageSize };
  }

  // --- Private helpers ---

  /**
   * CEO sees all branches; Branch Director sees only their branches.
   * Returns null for CEO (no branch filter needed).
   */
  private async getUserBranchIds(
    ctx: SearchContext,
  ): Promise<number[] | null> {
    if (ctx.roles.includes('CEO')) return null;

    const userBranches = await this.prisma.userBranch.findMany({
      where: { userId: ctx.userId },
      select: { branchId: true },
    });

    return userBranches.map((ub) => ub.branchId);
  }

  /**
   * Sort results by relevance:
   * 1. Exact full match (label === query)
   * 2. Starts with query
   * 3. Contains query
   */
  private sortByRelevance(items: SearchItem[], query: string): SearchItem[] {
    const q = query.toLowerCase();
    return items.sort((a, b) => {
      const aLabel = a.label.toLowerCase();
      const bLabel = b.label.toLowerCase();

      const aExact = aLabel === q ? 0 : 1;
      const bExact = bLabel === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aStarts = aLabel.startsWith(q) ? 0 : 1;
      const bStarts = bLabel.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;

      return aLabel.localeCompare(bLabel);
    });
  }

  /**
   * Build name search conditions supporting multi-word queries.
   * "Ali Valiyev" → firstName contains "Ali" AND lastName contains "Valiyev"
   * "Ali" → firstName contains "Ali" OR lastName contains "Ali"
   */
  private buildNameConditions(
    search: string,
  ): { firstName: Prisma.StringFilter; lastName: Prisma.StringFilter }[] {
    const words = search.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
      // "Ali Valiyev" → try both orders: (first=Ali, last=Valiyev) OR (first=Valiyev, last=Ali)
      return [
        {
          firstName: { contains: words[0], mode: 'insensitive' as const },
          lastName: {
            contains: words.slice(1).join(' '),
            mode: 'insensitive' as const,
          },
        },
        {
          firstName: {
            contains: words.slice(1).join(' '),
            mode: 'insensitive' as const,
          },
          lastName: { contains: words[0], mode: 'insensitive' as const },
        },
      ];
    }

    // Single word → search in both fields
    return [
      {
        firstName: { contains: search, mode: 'insensitive' as const },
        lastName: { startsWith: '', mode: 'insensitive' as const },
      },
      {
        firstName: { startsWith: '', mode: 'insensitive' as const },
        lastName: { contains: search, mode: 'insensitive' as const },
      },
    ];
  }

  /**
   * Parse search input to determine search type
   */
  private parseSearch(search: string) {
    const isIdSearch = search.startsWith('#');
    const idValue = isIdSearch ? Number(search.slice(1)) : null;
    const isNumeric = /^\d+$/.test(search);
    const numericValue = isNumeric ? Number(search) : null;
    return { isIdSearch, idValue, isNumeric, numericValue };
  }

  // --- Search methods ---

  private readonly studentSelect = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    photo: true,
    balance: true,
    enrollments: {
      where: { status: EnrollmentStatus.ACTIVE },
      take: 1,
      select: {
        group: {
          select: {
            name: true,
            teachers: {
              take: 1,
              select: {
                teacher: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    },
  };

  private mapStudent(s: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    photo: string | null;
    balance: number;
    enrollments: {
      group: {
        name: string;
        teachers: { teacher: { firstName: string; lastName: string } }[];
      };
    }[];
  }): SearchItem {
    const enrollment = s.enrollments?.[0];
    const group = enrollment?.group;
    const teacher = group?.teachers?.[0]?.teacher;
    return {
      id: s.id,
      label: `${s.firstName} ${s.lastName}`,
      phone: s.phone,
      photo: s.photo,
      groupName: group?.name ?? null,
      teacherName: teacher
        ? `${teacher.firstName} ${teacher.lastName}`
        : null,
      balance: s.balance ?? 0,
    };
  }

  private async searchStudents(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildStudentWhere(search, companyId, branchIds);

    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: this.studentSelect,
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      items: this.sortByRelevance(items.map((s) => this.mapStudent(s)), search),
      total,
    };
  }

  private async searchUsers(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildUserWhere(search, companyId, branchIds);

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          photo: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: this.sortByRelevance(
        items.map((u) => ({
          id: u.id,
          label: `${u.firstName} ${u.lastName}`,
          sublabel: u.roles.map((r) => r.role.name).join(', '),
          phone: u.phone,
          photo: u.photo,
        })),
        search,
      ),
      total,
    };
  }

  private async searchTeachers(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildTeacherWhere(search, companyId, branchIds);

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          photo: true,
        },
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: this.sortByRelevance(
        items.map((t) => ({
          id: t.id,
          label: `${t.firstName} ${t.lastName}`,
          phone: t.phone,
          photo: t.photo,
        })),
        search,
      ),
      total,
    };
  }

  private async searchGroups(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildGroupWhere(search, companyId, branchIds);

    const [items, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        select: { id: true, name: true, groupNumber: true },
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return {
      items: items.map((g) => ({
        id: g.id,
        label: g.name,
        sublabel: g.groupNumber ? `#${g.groupNumber}` : undefined,
      })),
      total,
    };
  }

  private async searchCourses(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildCourseWhere(search, companyId, branchIds);

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        select: { id: true, name: true },
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        label: c.name,
      })),
      total,
    };
  }

  // --- Where builders ---

  private buildStudentWhere(
    search: string,
    companyId: number,
    branchIds: number[] | null,
  ): Prisma.StudentWhereInput {
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      companyId,
    };

    if (branchIds) {
      where.branches = { some: { branchId: { in: branchIds } } };
    }

    const { isIdSearch, idValue, isNumeric, numericValue } =
      this.parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = this.buildNameConditions(search);
      where.OR = [
        ...nameConditions,
        { phone: { contains: search } },
      ];
    }

    return where;
  }

  private buildUserWhere(
    search: string,
    companyId: number,
    branchIds: number[] | null,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      // Exclude teachers (roleId=4) and students (roleId=6) — they have their own categories
      roles: {
        some: { roleId: { in: [1, 2, 3, 5] } },
        none: { roleId: 4 },
      },
    };

    if (branchIds) {
      where.branches = { some: { branchId: { in: branchIds } } };
    }

    const { isIdSearch, idValue, isNumeric, numericValue } =
      this.parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = this.buildNameConditions(search);
      where.OR = nameConditions;
    }

    return where;
  }

  private buildTeacherWhere(
    search: string,
    companyId: number,
    branchIds: number[] | null,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      roles: { some: { roleId: 4 } },
    };

    if (branchIds) {
      where.branches = { some: { branchId: { in: branchIds } } };
    }

    const { isIdSearch, idValue, isNumeric, numericValue } =
      this.parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = this.buildNameConditions(search);
      where.OR = nameConditions;
    }

    return where;
  }

  private buildGroupWhere(
    search: string,
    companyId: number,
    branchIds: number[] | null,
  ): Prisma.GroupWhereInput {
    const where: Prisma.GroupWhereInput = {
      deletedAt: null,
      companyId,
      name: { contains: search, mode: 'insensitive' },
    };

    if (branchIds) {
      where.branchId = { in: branchIds };
    }

    return where;
  }

  private buildCourseWhere(
    search: string,
    companyId: number,
    branchIds: number[] | null,
  ): Prisma.CourseWhereInput {
    const where: Prisma.CourseWhereInput = {
      deletedAt: null,
      companyId,
      name: { contains: search, mode: 'insensitive' },
    };

    if (branchIds) {
      where.branchId = { in: branchIds };
    }

    return where;
  }
}
