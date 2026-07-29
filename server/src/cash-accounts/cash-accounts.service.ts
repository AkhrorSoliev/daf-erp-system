import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { Prisma } from '@prisma/client';
import { CashMovementsService } from './cash-movements.service';
import { CreateCashAccountDto } from './dto/create-cash-account.dto';
import { UpdateCashAccountDto } from './dto/update-cash-account.dto';
import { CashAccountQueryDto } from './dto/cash-account-query.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReconcileDto } from './dto/reconcile.dto';

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10000,
  timeout: 15000,
} as const;

@Injectable()
export class CashAccountsService {
  constructor(
    private prisma: PrismaService,
    private cashMovements: CashMovementsService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * Branch scope: CEO / Administrator see every account; a Branch Director is
   * restricted to their own mainBranch (plus company-wide accounts). Returns
   * undefined for "no restriction", or an array of allowed branchIds.
   */
  private async resolveBranchScope(
    userId: number,
    roles: string[],
    requestedBranchId?: number,
  ): Promise<number[] | undefined> {
    const isBd =
      roles.includes('Branch Director') &&
      !roles.includes('CEO') &&
      !roles.includes('Administrator');
    if (isBd) {
      const caller = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { mainBranch: true },
      });
      const own = caller?.mainBranch ? [caller.mainBranch] : [];
      if (requestedBranchId) {
        return own.includes(requestedBranchId) ? [requestedBranchId] : [];
      }
      return own;
    }
    return requestedBranchId ? [requestedBranchId] : undefined;
  }

  async create(dto: CreateCashAccountDto, userId: number, companyId: number) {
    // Every account belongs to exactly one branch — a branch-less "company"
    // account is what silently absorbed branch outflows until it drifted
    // negative (docs/branch-decisions.md D4).
    if (!dto.branchId) {
      throw new BadRequestException(
        "Kassa hisobi uchun filial tanlanishi shart",
      );
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Filial topilmadi');

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.create({
        data: {
          name: dto.name,
          type: dto.type,
          branchId: dto.branchId,
          companyId,
        },
      });

      // Opening balance, if any, is established as an ADJUSTMENT movement so the
      // ledger and the denormalized balance reconcile from the very first row.
      if (dto.openingBalance && dto.openingBalance > 0) {
        await this.cashMovements.adjust(
          {
            cashAccountId: account.id,
            signedAmount: dto.openingBalance,
            companyId,
            description: "Boshlang'ich qoldiq",
            performedById: userId,
          },
          tx,
        );
      }

      await this.entityHistory.recordCreate({
        entityType: 'CashAccount',
        entityId: account.id,
        newValues: account,
        changedById: userId,
        companyId,
        tx,
      });

      return tx.cashAccount.findUnique({ where: { id: account.id } });
    }, TX);
  }

  async findAll(
    query: CashAccountQueryDto,
    companyId: number,
    userId: number,
    roles: string[],
  ) {
    const branchIds = await this.resolveBranchScope(
      userId,
      roles,
      query.branchId,
    );
    if (branchIds && branchIds.length === 0) {
      return { data: [], totalBalance: 0 };
    }

    const where: Prisma.CashAccountWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      // Branch-less accounts no longer exist, so a scoped caller sees exactly
      // their own branches' accounts — nothing "shared" to fall back on.
      ...(branchIds && { branchId: { in: branchIds } }),
    };

    const data = await this.prisma.cashAccount.findMany({
      where,
      orderBy: [{ branchId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
    });

    const totalBalance = data.reduce((s, a) => s + a.balance, 0);
    return { data, totalBalance };
  }

  async findOne(id: string, companyId: number) {
    const account = await this.prisma.cashAccount.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Kassa hisobi topilmadi');
    return account;
  }

  async getMovements(
    id: string,
    query: MovementQueryDto,
    companyId: number,
  ) {
    await this.findOne(id, companyId); // existence + tenant guard
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.CashMovementWhereInput = {
      cashAccountId: id,
      companyId,
      ...(query.type && { type: query.type }),
      ...((query.startDate || query.endDate) && {
        createdAt: {
          ...(query.startDate && { gte: new Date(query.startDate) }),
          ...(query.endDate && { lte: new Date(query.endDate) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cashMovement.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async update(
    id: string,
    dto: UpdateCashAccountDto,
    userId: number,
    companyId: number,
  ) {
    const existing = await this.findOne(id, companyId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      await this.entityHistory.recordUpdate({
        entityType: 'CashAccount',
        entityId: id,
        oldValues: existing,
        newValues: account,
        changedById: userId,
        companyId,
        tx,
      });

      return account;
    }, TX);

    return updated;
  }

  async remove(id: string, userId: number, companyId: number) {
    const existing = await this.findOne(id, companyId);
    // Guard: don't archive an account that still holds money — its balance
    // would silently vanish from the cash-balance KPI. Drain / transfer first.
    if (existing.balance !== 0) {
      throw new BadRequestException(
        "Qoldig'i 0 bo'lmagan kassa hisobini o'chirib bo'lmaydi. Avval mablag'ni o'tkazing.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cashAccount.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.entityHistory.recordDelete({
        entityType: 'CashAccount',
        entityId: id,
        oldValues: existing,
        changedById: userId,
        companyId,
        tx,
      });
    }, TX);

    return { message: "Kassa hisobi o'chirildi" };
  }

  async transfer(dto: TransferDto, userId: number, companyId: number) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException(
        "Manba va qabul qiluvchi hisob bir xil bo'lishi mumkin emas",
      );
    }
    const from = await this.findOne(dto.fromAccountId, companyId);
    const to = await this.findOne(dto.toAccountId, companyId);
    if (from.balance < dto.amount) {
      throw new BadRequestException("Manba hisobda yetarli mablag' yo'q");
    }

    await this.cashMovements.transfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: dto.amount,
      companyId,
      description: dto.note,
      performedById: userId,
    });

    return {
      from: await this.findOne(from.id, companyId),
      to: await this.findOne(to.id, companyId),
    };
  }

  async reconcile(
    id: string,
    dto: ReconcileDto,
    userId: number,
    companyId: number,
  ) {
    const account = await this.findOne(id, companyId);
    const delta = dto.actualBalance - account.balance;
    if (delta === 0) {
      return account; // already reconciled
    }

    await this.prisma.$transaction(async (tx) => {
      await this.cashMovements.adjust(
        {
          cashAccountId: id,
          signedAmount: delta,
          companyId,
          description: `Solishtiruv: ${dto.reason}`,
          performedById: userId,
        },
        tx,
      );
      await this.entityHistory.recordUpdate({
        entityType: 'CashAccount',
        entityId: id,
        oldValues: { balance: account.balance },
        newValues: { balance: dto.actualBalance },
        changedById: userId,
        companyId,
        tx,
      });
    }, TX);

    return this.findOne(id, companyId);
  }
}
