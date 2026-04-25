import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryResult } from './shared/search-helpers';

@Injectable()
export class SearchContentService {
  constructor(private prisma: PrismaService) {}

  async searchGroups(
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

  async fullSearchGroups(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    skip: number,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildGroupWhere(search, companyId, branchIds);
    const [items, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        select: { id: true, name: true, groupNumber: true },
        skip,
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

  async searchCourses(
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

  async fullSearchCourses(
    search: string,
    companyId: number,
    branchIds: number[] | null,
    skip: number,
    take: number,
  ): Promise<CategoryResult> {
    const where = this.buildCourseWhere(search, companyId, branchIds);
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        select: { id: true, name: true },
        skip,
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
