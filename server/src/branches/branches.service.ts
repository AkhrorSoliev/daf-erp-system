import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: BranchQueryDto) {
    const where: any = { deletedAt: null };
    if (query.company_id) {
      where.companyId = query.company_id;
    }

    return this.prisma.branch.findMany({
      where,
      select: { id: true, name: true, address: true, phone: true, isActive: true, startOfWorkingDay: true, endOfWorkingDay: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    const [groupsCount, studentsCount, teachersCount, roomsCount, coursesCount] =
      await Promise.all([
        this.prisma.group.count({
          where: { branchId: id, deletedAt: null },
        }),
        this.prisma.studentBranch.count({
          where: {
            branchId: id,
            student: { deletedAt: null },
          },
        }),
        this.prisma.userBranch.count({
          where: {
            branchId: id,
            user: {
              deletedAt: null,
              roles: { some: { roleId: 4 } },
            },
          },
        }),
        this.prisma.room.count({
          where: { branchId: id, deletedAt: null },
        }),
        this.prisma.course.count({
          where: { branchId: id, deletedAt: null },
        }),
      ]);

    return {
      ...branch,
      _count: {
        groups: groupsCount,
        students: studentsCount,
        teachers: teachersCount,
        rooms: roomsCount,
        courses: coursesCount,
      },
    };
  }

  async create(dto: CreateBranchDto) {
    const lastBranch = await this.prisma.branch.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const nextId = (lastBranch?.id ?? 0) + 1;

    return this.prisma.branch.create({
      data: {
        id: nextId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        companyId: dto.companyId,
      },
    });
  }

  async update(id: number, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    return this.prisma.branch.update({
      where: { id },
      data: dto,
    });
  }
}
