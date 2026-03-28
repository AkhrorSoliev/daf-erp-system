import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

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
          level: true,
          description: true,
          price: true,
          courseDuration: true,
          lessonDuration: true,
          lessonMinutes: true,
          isActive: true,
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

  async create(dto: CreateCourseDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    return this.prisma.course.create({
      data: {
        name: dto.name,
        level: dto.level,
        lessonMinutes: dto.lessonMinutes,
        description: dto.description,
        lessonDuration: dto.lessonDuration,
        courseDuration: dto.courseDuration,
        price: dto.price,
        branchId: dto.branchId,
        companyId: dto.companyId,
      },
    });
  }

  async update(id: string, dto: UpdateCourseDto) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    return this.prisma.course.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, userId: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException(`Kurs #${id} topilmadi`);
    }

    await this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Kurs muvaffaqiyatli o'chirildi" };
  }
}
