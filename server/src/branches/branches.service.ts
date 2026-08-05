import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus, CashAccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ChangeBranchStatusDto } from './dto/change-branch-status.dto';
import { ReportBranchIds } from '../common/finance/report-branch-scope';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(
    query: BranchQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    // Caller company is authoritative; legacy ?company_id= filter is ignored
    // to prevent a user from querying another company's branches.
    //
    // Branch-confined too: this endpoint IS the branch switcher's option list.
    // It returned every branch in the company and the client hid the ones the
    // user should not see — a UI filter, not a boundary. Now the server decides,
    // so a scoped caller cannot enumerate (or select) a branch that is not
    // theirs. `id: { in: … }` rather than `branchIdWhere`, because here the
    // branch IS the row.
    const where: any = {
      deletedAt: null,
      companyId,
      ...(scope == null ? {} : { id: { in: scope } }),
    };

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

  async findOne(id: number, companyId: number, scope: ReportBranchIds) {
    // The scope predicate is nested under AND, not spread: both target `id`,
    // and a spread would REPLACE the requested id with `{ in: scope }` —
    // returning whichever branch the caller happens to own instead of the one
    // they asked for.
    const branch = await this.prisma.branch.findFirst({
      where: {
        id,
        deletedAt: null,
        companyId,
        ...(scope == null ? {} : { AND: [{ id: { in: scope } }] }),
      },
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

  /**
   * A new branch must be OPERATIONALLY USABLE the moment it exists.
   *
   * Three defects met here. `startOfWorkingDay`/`endOfWorkingDay` were accepted
   * by the DTO, sent by the client and then silently dropped — the `data` block
   * never mentioned them — so branch #2 was created with NULL hours and every
   * schedule fell back to a hardcoded 08:00–20:00 while branch #1 ran to 22:30.
   * No cash accounts were created, so the first payment had nowhere to land
   * (`resolveAccountId` now throws rather than drifting into a company account).
   * And `nextId` came from an unscoped `findFirst` outside any transaction, so
   * two concurrent creates could pick the same id.
   *
   * All of it now happens in ONE transaction: either the branch exists complete,
   * or it does not exist.
   */
  async create(dto: CreateBranchDto, companyId: number, userId?: number) {
    const branch = await this.prisma.$transaction(async (tx) => {
      // No `id` — the database assigns it from `Branch_id_seq`.
      //
      // This used to be `findFirst({ orderBy: { id: 'desc' } }) + 1`, which two
      // concurrent creates would both read as the same value. Scoping the query
      // per company (an earlier attempt at a fix) made it worse rather than
      // better: `Branch.id` is a GLOBAL primary key, so a per-company maximum
      // guarantees a collision the moment a second company exists.
      const created = await tx.branch.create({
        data: {
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          // Previously dropped on the floor.
          startOfWorkingDay: dto.startOfWorkingDay,
          endOfWorkingDay: dto.endOfWorkingDay,
          companyId,
        },
      });

      // CASH + BANK, the same pair `scripts/backfill-cash-accounts.ts` creates.
      // Without them the branch takes no money at all: `CashAccount.branchId`
      // is NOT NULL and there is no company-wide fallback any more (D4).
      await tx.cashAccount.createMany({
        data: [
          {
            name: `${dto.name} kassa`,
            type: CashAccountType.CASH,
            branchId: created.id,
            companyId,
          },
          {
            name: `${dto.name} bank`,
            type: CashAccountType.BANK,
            branchId: created.id,
            companyId,
          },
        ],
      });

      return created;
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
   * What still stands between this branch and its first real student.
   *
   * Everything listed here was discovered the hard way while opening branch #2:
   * a course is required to create a group, a group with no room is never drawn
   * on the daily schedule, a teacher with no salary rate accrues NOTHING for
   * every lesson they teach and it cannot be back-dated afterwards (~20 mln so'm
   * went missing this way in May 2026), and with no branch administrator the
   * attendance-escalation cron drops its alerts silently.
   *
   * Read-only. It reports; it does not fix.
   */
  async getReadiness(id: number, companyId: number, userId: number) {
    // `@Roles('CEO','Branch Director')` proves the caller holds a role, not that
    // this branch is theirs. Without this a Fargona director could read
    // Namangan's readiness — including the names of teachers with no salary rate.
    await this.assertCallerMayTouchBranch(id, userId);

    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, companyId },
      select: {
        id: true,
        name: true,
        startOfWorkingDay: true,
        endOfWorkingDay: true,
      },
    });
    if (!branch) throw new NotFoundException(`Branch #${id} topilmadi`);

    const [cashTypes, roomCount, courseCount, adminCount, teachers] =
      await Promise.all([
        this.prisma.cashAccount.findMany({
          where: { branchId: id, companyId, deletedAt: null },
          select: { type: true },
        }),
        this.prisma.room.count({ where: { branchId: id, deletedAt: null } }),
        this.prisma.course.count({ where: { branchId: id, deletedAt: null } }),
        this.prisma.user.count({
          where: {
            companyId,
            deletedAt: null,
            isActive: true,
            roles: { some: { role: { name: 'Administrator' } } },
            branches: { some: { branchId: id } },
          },
        }),
        this.prisma.user.findMany({
          where: {
            companyId,
            deletedAt: null,
            isActive: true,
            roles: { some: { role: { name: 'Teacher' } } },
            branches: { some: { branchId: id } },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            salaryConfigs: {
              where: { isActive: true },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ]);

    const types = new Set(cashTypes.map((c) => c.type));
    // Named so the UI can list exactly who to fix, not just "some teacher".
    const teachersWithoutRate = teachers
      .filter((t) => t.salaryConfigs.length === 0)
      .map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }));

    const checks = [
      {
        key: 'cashAccount',
        label: 'Naqd kassa',
        ok: types.has(CashAccountType.CASH),
        hint: "Filialga CASH kassasi kerak — busiz to'lov qabul qilinmaydi",
      },
      {
        key: 'bankAccount',
        label: 'Bank hisobi',
        ok: types.has(CashAccountType.BANK),
        hint: "Bank/karta tushumi uchun BANK hisobi kerak",
      },
      {
        key: 'workingHours',
        label: 'Ish vaqti',
        ok: !!branch.startOfWorkingDay && !!branch.endOfWorkingDay,
        hint: "Ish vaqti belgilanmasa jadval 08:00–20:00 ga tushadi",
      },
      {
        key: 'course',
        label: 'Kurs',
        ok: courseCount > 0,
        hint: 'Kurssiz guruh ochib bolmaydi',
      },
      {
        key: 'room',
        label: 'Xona',
        ok: roomCount > 0,
        hint: 'Xonasiz guruh kunlik jadvalda chizilmaydi',
      },
      {
        key: 'administrator',
        label: 'Administrator',
        ok: adminCount > 0,
        hint: "Administratorsiz davomat ogohlantirishlari hech kimga bormaydi",
      },
      {
        key: 'teacherRates',
        label: 'Ustoz stavkalari',
        ok: teachersWithoutRate.length === 0,
        hint: "Stavkasiz ustozning darslari uchun oylik YOZILMAYDI va keyin orqaga surib bo'lmaydi",
        details: teachersWithoutRate,
      },
    ];

    return {
      branchId: branch.id,
      branchName: branch.name,
      ready: checks.every((c) => c.ok),
      checks,
    };
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

  async getStatusHistory(id: number, companyId: number, userId: number) {
    await this.assertCallerMayTouchBranch(id, userId);

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
