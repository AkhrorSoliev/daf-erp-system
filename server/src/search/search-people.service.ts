import { Injectable } from '@nestjs/common';
import { Prisma, EnrollmentStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryResult,
  SearchItem,
  buildNameConditions,
  parseSearch,
  sortByRelevance,
} from './shared/search-helpers';

@Injectable()
export class SearchPeopleService {
  constructor(private prisma: PrismaService) {}

  private readonly studentSelect = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    photo: true,
    balance: true,
    status: true,
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
    status: StudentStatus;
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
      teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
      balance: s.balance ?? 0,
      status: s.status === StudentStatus.ACTIVE ? null : s.status,
    };
  }

  async searchStudents(
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
      items: sortByRelevance(
        items.map((s) => this.mapStudent(s)),
        search,
      ),
      total,
    };
  }

  async fullSearchStudents(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    skip: number,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildStudentWhere(search, companyId, branchIds);
    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: this.studentSelect,
        skip,
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.student.count({ where }),
    ]);
    return {
      items: sortByRelevance(
        items.map((s) => this.mapStudent(s)),
        search,
      ),
      total,
    };
  }

  async searchUsers(
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
      items: sortByRelevance(
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

  async fullSearchUsers(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    skip: number,
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
        skip,
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: sortByRelevance(
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

  async searchTeachers(
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
      items: sortByRelevance(
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

  async fullSearchTeachers(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    skip: number,
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
        skip,
        take,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: sortByRelevance(
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
      parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { extraPhone: { contains: search } },
        { parentPhone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = buildNameConditions(search);
      where.OR = [
        ...nameConditions,
        { phone: { contains: search } },
        { extraPhone: { contains: search } },
        { parentPhone: { contains: search } },
        { parentName: { contains: search, mode: 'insensitive' } },
        { telegram: { contains: search, mode: 'insensitive' } },
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
      parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = buildNameConditions(search);
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
      parseSearch(search);

    if (isIdSearch && idValue && !isNaN(idValue)) {
      where.id = { equals: idValue };
    } else if (isNumeric && numericValue) {
      where.OR = [
        { phone: { contains: search } },
        { id: { equals: numericValue } },
      ];
    } else {
      const nameConditions = buildNameConditions(search);
      where.OR = nameConditions;
    }

    return where;
  }
}
