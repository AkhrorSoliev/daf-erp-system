import { Injectable, NotFoundException } from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RoomQueryDto } from './dto/room-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CountByBranchQueryDto } from './dto/count-by-branch-query.dto';
import { ChangeRoomStatusDto } from './dto/change-room-status.dto';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  private async invalidateActivityCache(companyId: number) {
    const patterns = [
      `reports:center-activity:${companyId}:*`,
      `reports:room-util:${companyId}:*`,
    ];
    for (const pattern of patterns) {
      const stream = this.redis.scanStream({ match: pattern, count: 100 });
      for await (const keys of stream) {
        if ((keys as string[]).length > 0) {
          await this.redis.del(...(keys as string[]));
        }
      }
    }
  }

  async findAll(
    query: RoomQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const where = {
      deletedAt: null,
      companyId,
      ...branchIdWhere(scope),
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
          _count: {
            select: {
              groups: {
                where: {
                  deletedAt: null,
                  statusEnum: { in: ['ACTIVE', 'FORMING'] },
                  isActive: true,
                },
              },
            },
          },
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

  async findOne(id: string, companyId: number, scope: ReportBranchIds) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null, companyId, ...branchIdWhere(scope) },
      select: {
        id: true,
        name: true,
        capacity: true,
        branchId: true,
        branch: {
          select: {
            name: true,
            startOfWorkingDay: true,
            endOfWorkingDay: true,
          },
        },
        groups: {
          where: {
            deletedAt: null,
            statusEnum: { in: ['ACTIVE', 'FORMING'] },
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            statusEnum: true,
            course: { select: { name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
          orderBy: { lessonStartTime: 'asc' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    return room;
  }

  async countByBranch(query: CountByBranchQueryDto, companyId: number) {
    // Caller company is authoritative; ignore ?company_id= query param.
    const branchWhere: any = { deletedAt: null, companyId };

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

  async create(dto: CreateRoomDto, companyId: number, userId?: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null, companyId },
    });
    if (!branch) {
      throw new NotFoundException(`Filial #${dto.branchId} topilmadi`);
    }

    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        capacity: dto.capacity,
        branchId: dto.branchId,
        companyId,
      },
      include: { branch: { select: { name: true } } },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Room',
      entityId: room.id,
      newValues: room,
      changedById: userId,
      companyId,
    });

    // Activity report snapshot — initial capacity
    if (room.capacity != null) {
      await this.prisma.roomCapacitySnapshot.create({
        data: {
          roomId: room.id,
          capacity: room.capacity,
          validFrom: room.createdAt,
          changedById: userId,
        },
      });
    }

    await this.invalidateActivityCache(companyId);

    return room;
  }

  async update(
    id: string,
    dto: UpdateRoomDto,
    userId: number | undefined,
    companyId: number,
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null, companyId },
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

    // Activity report snapshot — capacity change starts a new SCD2 row
    if (
      dto.capacity !== undefined &&
      dto.capacity !== room.capacity &&
      dto.capacity != null
    ) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.roomCapacitySnapshot.updateMany({
          where: { roomId: id, validTo: null },
          data: { validTo: now },
        }),
        this.prisma.roomCapacitySnapshot.create({
          data: {
            roomId: id,
            capacity: dto.capacity,
            validFrom: now,
            changedById: userId,
          },
        }),
      ]);
    }

    if (room.companyId != null) {
      await this.invalidateActivityCache(room.companyId);
    }

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeRoomStatusDto,
    userId: number,
    companyId: number,
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null, companyId },
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
        status: dto.status,
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

    if (room.companyId != null) {
      await this.invalidateActivityCache(room.companyId);
    }

    return updated;
  }

  async getStatusHistory(id: string, companyId: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!room) {
      throw new NotFoundException(`Xona #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Room', id);
  }

  async delete(id: string, userId: number, companyId: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null, companyId },
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

    if (room.companyId != null) {
      await this.invalidateActivityCache(room.companyId);
    }

    return { message: "Xona muvaffaqiyatli o'chirildi" };
  }
}
