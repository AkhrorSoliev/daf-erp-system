import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomQueryDto } from './dto/room-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CountByBranchQueryDto } from './dto/count-by-branch-query.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: RoomQueryDto) {
    const where = {
      branchId: query.branch_id,
      deletedAt: null,
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const [data, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        select: {
          id: true,
          name: true,
          capacity: true,
          branchId: true,
          branch: { select: { name: true } },
          _count: { select: { groups: { where: { deletedAt: null } } } },
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        branchId: r.branchId,
        branch: r.branch,
        groupCount: r._count.groups,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
      include: {
        branch: { select: { name: true } },
        groups: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            course: { select: { name: true } },
            teacher: { select: { id: true, name: true } },
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    return room;
  }

  async countByBranch(query: CountByBranchQueryDto) {
    const branchWhere: any = { deletedAt: null };
    if (query.company_id) {
      branchWhere.companyId = query.company_id;
    }

    const branches = await this.prisma.branch.findMany({
      where: branchWhere,
      select: {
        id: true,
        name: true,
        address: true,
        isActive: true,
        _count: { select: { rooms: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      isActive: b.isActive,
      roomCount: b._count.rooms,
    }));
  }

  async create(dto: CreateRoomDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    return this.prisma.room.create({
      data: {
        name: dto.name,
        capacity: dto.capacity,
        branchId: dto.branchId,
        companyId: dto.companyId,
      },
      include: { branch: { select: { name: true } } },
    });
  }

  async update(id: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    return this.prisma.room.update({
      where: { id },
      data: dto,
      include: { branch: { select: { name: true } } },
    });
  }

  async delete(id: string, userId: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    await this.prisma.room.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Xona muvaffaqiyatli o'chirildi" };
  }
}
