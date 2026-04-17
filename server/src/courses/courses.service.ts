import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ChangeCourseStatusDto } from './dto/change-course-status.dto';

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(query: CourseQueryDto) {
    const where = {
      branchId: query.branch_id,
      deletedAt: null,
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const [data, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          lessonPaymentCount: true,
          courseDuration: true,
          lessonDuration: true,
          lessonMinutes: true,
          isActive: true,
          status: true,
          branchId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: {
        branch: { select: { name: true } },
        _count: { select: { groups: { where: { deletedAt: null } } } },
      },
    });

    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    return course;
  }

  async create(dto: CreateCourseDto, userId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    const course = await this.prisma.course.create({
      data: {
        name: dto.name,
        lessonMinutes: dto.lessonMinutes,
        description: dto.description,
        lessonDuration: dto.lessonDuration,
        courseDuration: dto.courseDuration,
        price: dto.price,
        branchId: dto.branchId,
        companyId: dto.companyId,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Course',
      entityId: course.id,
      newValues: course,
      changedById: userId,
      companyId: dto.companyId ?? undefined,
    });

    return course;
  }

  async update(id: string, dto: UpdateCourseDto, userId?: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: dto,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Course',
      entityId: id,
      oldValues: course,
      newValues: updated,
      changedById: userId,
      companyId: course.companyId ?? undefined,
    });

    return updated;
  }

  async changeStatus(id: string, dto: ChangeCourseStatusDto, userId: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });

    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Course',
      entityId: id,
      fromStatus: course.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: course.companyId ?? undefined,
    });

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        status: dto.status,
        isActive: dto.status === CourseStatus.ACTIVE,
        ...auditData,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Course',
      entityId: id,
      oldValues: { status: course.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: course.companyId ?? undefined,
    });

    // Cascade: ARCHIVED → guruhlarni yangilash
    await this.statusCascadeService.cascade('Course', id, dto.status, userId);

    return updated;
  }

  async getStatusHistory(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Course', id);
  }

  async delete(id: string, userId: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    await this.statusHistoryService.changeStatus({
      entityType: 'Course',
      entityId: id,
      fromStatus: course.status,
      toStatus: CourseStatus.ARCHIVED,
      reason: "O'chirildi",
      changedById: userId,
      companyId: course.companyId ?? undefined,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Course',
      entityId: id,
      oldValues: course,
      changedById: userId,
      companyId: course.companyId ?? undefined,
    });

    await this.prisma.course.update({
      where: { id },
      data: {
        status: CourseStatus.ARCHIVED,
        isActive: false,
        deletedAt: new Date(),
        deletedById: userId,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: "O'chirildi",
      },
    });

    return { message: "Kurs muvaffaqiyatli o'chirildi" };
  }
}
