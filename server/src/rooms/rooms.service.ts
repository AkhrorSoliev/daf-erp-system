import { Injectable, NotFoundException } from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RoomQueryDto } from './dto/room-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CountByBranchQueryDto } from './dto/count-by-branch-query.dto';
import { ChangeRoomStatusDto } from './dto/change-room-status.dto';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
  ) {}

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
          status: true,
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
        status: r.status,
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
            teachers: {
              include: {
                teacher: { select: { id: true, firstName: true, lastName: true } },
              },
            },
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

  async create(dto: CreateRoomDto, userId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        capacity: dto.capacity,
        branchId: dto.branchId,
        companyId: dto.companyId,
      },
      include: { branch: { select: { name: true } } },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Room',
      entityId: room.id,
      newValues: room,
      changedById: userId,
      companyId: dto.companyId ?? undefined,
    });

    return room;
  }

  async update(id: string, dto: UpdateRoomDto, userId?: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: dto,
      include: { branch: { select: { name: true } } },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Room',
      entityId: id,
      oldValues: room,
      newValues: updated,
      changedById: userId,
      companyId: room.companyId ?? undefined,
    });

    return updated;
  }

  async changeStatus(id: string, dto: ChangeRoomStatusDto, userId: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });

    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Room',
      entityId: id,
      fromStatus: room.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: room.companyId ?? undefined,
    });

    const updated = await this.prisma.room.update({
      where: { id },
      data: {
        status: dto.status as RoomStatus,
        ...auditData,
      },
      include: { branch: { select: { name: true } } },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Room',
      entityId: id,
      oldValues: { status: room.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: room.companyId ?? undefined,
    });

    return updated;
  }

  async getStatusHistory(id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Room', id);
  }

  async delete(id: string, userId: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    await this.statusHistoryService.changeStatus({
      entityType: 'Room',
      entityId: id,
      fromStatus: room.status,
      toStatus: RoomStatus.ARCHIVED,
      reason: "O'chirildi",
      changedById: userId,
      companyId: room.companyId ?? undefined,
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'Room',
      entityId: id,
      oldValues: room,
      changedById: userId,
      companyId: room.companyId ?? undefined,
    });

    await this.prisma.room.update({
      where: { id },
      data: {
        status: RoomStatus.ARCHIVED,
        deletedAt: new Date(),
        deletedById: userId,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: "O'chirildi",
      },
    });

    return { message: "Xona muvaffaqiyatli o'chirildi" };
  }
}
