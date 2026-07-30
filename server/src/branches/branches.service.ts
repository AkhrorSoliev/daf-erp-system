import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ChangeBranchStatusDto } from './dto/change-branch-status.dto';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(query: BranchQueryDto, companyId: number) {
    // Caller company is authoritative; legacy ?company_id= filter is ignored
    // to prevent a user from querying another company's branches.
    const where: any = { deletedAt: null, companyId };

    return this.prisma.branch.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        isActive: true,
        status: true,
        startOfWorkingDay: true,
        endOfWorkingDay: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    const [
      groupsCount,
      studentsCount,
      teachersCount,
      roomsCount,
      coursesCount,
    ] = await Promise.all([
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

  async create(dto: CreateBranchDto, companyId: number, userId?: number) {
    const lastBranch = await this.prisma.branch.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const nextId = (lastBranch?.id ?? 0) + 1;

    const branch = await this.prisma.branch.create({
      data: {
        id: nextId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        companyId,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Branch',
      entityId: branch.id,
      newValues: branch,
      changedById: userId,
      companyId,
    });

    return branch;
  }

  /**
   * A non-CEO caller may only touch their OWN branch.
   *
   * Both endpoints only checked `companyId`, so a Branch Director could pass
   * another branch's id and edit — or CLOSE — it. Closing cascades: every group
   * of that branch goes CANCELLED and every active enrollment DROPPED. One
   * request could stop the other branch entirely.
   */
  private async assertCallerMayTouchBranch(
    branchId: number,
    userId: number | undefined,
  ): Promise<void> {
    if (userId == null) {
      // No identifiable caller means no way to verify scope; fail closed.
      throw new ForbiddenException("Foydalanuvchi aniqlanmadi");
    }
    const caller = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        mainBranch: true,
        branches: { select: { branchId: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!caller) throw new ForbiddenException("Foydalanuvchi topilmadi");
    if (caller.roles.some((r) => r.role.name === 'CEO')) return;

    const allowed = new Set<number>([
      ...caller.branches.map((b) => b.branchId),
      ...(caller.mainBranch != null ? [caller.mainBranch] : []),
    ]);
    if (!allowed.has(branchId)) {
      throw new ForbiddenException(
        "Siz faqat o'z filialingizni tahrirlashingiz mumkin",
      );
    }
  }

  async update(
    id: number,
    dto: UpdateBranchDto,
    userId: number | undefined,
    companyId: number,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }
    await this.assertCallerMayTouchBranch(id, userId);

    const updated = await this.prisma.branch.update({
      where: { id },
      data: dto,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Branch',
      entityId: id,
      oldValues: branch,
      newValues: updated,
      changedById: userId,
      companyId: branch.companyId ?? undefined,
    });

    return updated;
  }

  async changeStatus(
    id: number,
    dto: ChangeBranchStatusDto,
    userId: number,
    companyId: number,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }
    await this.assertCallerMayTouchBranch(id, userId);

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Branch',
      entityId: String(id),
      fromStatus: branch.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: branch.companyId ?? undefined,
    });

    const isActive = dto.status === BranchStatus.ACTIVE;

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        status: dto.status,
        isActive,
        ...auditData,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Branch',
      entityId: id,
      oldValues: { status: branch.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: branch.companyId ?? undefined,
    });

    // Cascade: CLOSED/INACTIVE → guruhlar, xonalar, enrollmentlar
    await this.statusCascadeService.cascade(
      'Branch',
      String(id),
      dto.status,
      userId,
    );

    return updated;
  }

  async getStatusHistory(id: number, companyId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Branch', String(id));
  }
}
