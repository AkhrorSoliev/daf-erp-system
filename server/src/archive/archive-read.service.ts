import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveEntityType, ArchiveQueryDto } from './dto/archive-query.dto';
import {
  companyScope,
  getDelegate,
  getInclude,
  getSearchFilter,
  parseId,
} from './shared/archive-meta';

@Injectable()
export class ArchiveReadService {
  constructor(private prisma: PrismaService) {}

  async getCounts(companyId: number) {
    const deletedFilter = { deletedAt: { not: null } };
    const scoped = { ...deletedFilter, companyId };
    const [
      users,
      branches,
      rooms,
      courses,
      students,
      leads,
      leadSections,
      groups,
      enrollments,
      holidays,
    ] = await Promise.all([
      this.prisma.user.count({ where: scoped }),
      this.prisma.branch.count({ where: scoped }),
      this.prisma.room.count({ where: scoped }),
      this.prisma.course.count({ where: scoped }),
      this.prisma.student.count({ where: scoped }),
      // Lead/Holiday/Enrollment are company-global in schema — count unscoped.
      this.prisma.lead.count({ where: deletedFilter }),
      // Archived board sections live in the leads archive too — fold them into
      // the leads count so the entry-point card reflects what's restorable.
      this.prisma.leadSection.count({ where: deletedFilter }),
      this.prisma.group.count({ where: scoped }),
      this.prisma.enrollment.count({ where: deletedFilter }),
      this.prisma.holiday.count({ where: deletedFilter }),
    ]);
    return {
      users,
      branches,
      rooms,
      courses,
      students,
      leads: leads + leadSections,
      groups,
      enrollments,
      holidays,
    };
  }

  async findAll(
    entityType: ArchiveEntityType,
    query: ArchiveQueryDto,
    companyId: number,
  ) {
    const { page = 1, pageSize = 10, search } = query;
    const skip = (page - 1) * pageSize;

    const delegate = getDelegate(this.prisma, entityType);
    const where: any = {
      deletedAt: { not: null },
      ...companyScope(entityType, companyId),
    };

    if (search) {
      const searchFilter = getSearchFilter(entityType, search);
      Object.assign(where, searchFilter);
    }

    const include = getInclude(entityType);

    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { deletedAt: 'desc' },
        ...(include && { include }),
      }),
      delegate.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(
    entityType: ArchiveEntityType,
    id: string | number,
    companyId: number,
  ) {
    const delegate = getDelegate(this.prisma, entityType);
    const include = getInclude(entityType);
    const parsedId = parseId(entityType, id);

    const record = await delegate.findFirst({
      where: {
        id: parsedId,
        deletedAt: { not: null },
        ...companyScope(entityType, companyId),
      },
      ...(include && { include }),
    });

    if (!record) {
      throw new NotFoundException(`Arxivda ${entityType}/${id} topilmadi`);
    }

    return record;
  }
}
