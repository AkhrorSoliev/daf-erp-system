import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateExpenseDto, userId: number, companyId: number) {
    // TEACHER_ADVANCE must name the recipient employee, and that employee
    // must belong to this company.
    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      if (!dto.relatedUserId) {
        throw new BadRequestException(
          "TEACHER_ADVANCE xarajati uchun xodim (relatedUserId) ko'rsatilishi shart",
        );
      }
      const user = await this.prisma.user.findFirst({
        where: { id: dto.relatedUserId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('Xodim topilmadi');
      }
    }

    // Atomic: expense row + ledger entry are all-or-nothing.
    const expense = await this.prisma.$transaction(
      async (tx) => {
        const expense = await tx.expense.create({
          data: {
            category: dto.category,
            amount: dto.amount,
            description: dto.description,
            date: new Date(dto.date),
            branchId: dto.branchId,
            receiptUrl: dto.receiptUrl,
            relatedUserId: dto.relatedUserId,
            createdById: userId,
            companyId,
          },
        });

        await this.transactionsService.recordExpense(
          {
            expenseId: expense.id,
            amount: dto.amount,
            companyId,
            branchId: dto.branchId,
            performedById: userId,
            relatedUserId: dto.relatedUserId,
            description: dto.description,
          },
          tx,
        );

        return expense;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.entityHistoryService.recordCreate({
      entityType: 'Expense',
      entityId: expense.id,
      newValues: expense,
      changedById: userId,
      companyId,
    });

    return expense;
  }

  async findAll(query: ExpenseQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.ExpenseWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.category && { category: query.category }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.startDate && query.endDate && {
        date: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: {
          id: true,
          category: true,
          amount: true,
          description: true,
          date: true,
          branchId: true,
          receiptUrl: true,
          createdAt: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async update(id: string, dto: Partial<CreateExpenseDto>, userId: number, companyId: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    // Detect if the change touches financial fields. Description/date/branch/
    // receiptUrl edits do not require a ledger correction; amount or category
    // changes must be reflected in Transaction or cash-flow reports drift.
    const amountChanged = dto.amount !== undefined && dto.amount !== existing.amount;
    const categoryChanged = dto.category !== undefined && dto.category !== existing.category;
    const relatedUserChanged =
      dto.relatedUserId !== undefined && dto.relatedUserId !== existing.relatedUserId;
    const financialFieldChanged = amountChanged || categoryChanged || relatedUserChanged;

    const expense = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.expense.update({
          where: { id },
          data: {
            ...(dto.category && { category: dto.category }),
            ...(dto.amount !== undefined && { amount: dto.amount }),
            ...(dto.description && { description: dto.description }),
            ...(dto.date && { date: new Date(dto.date) }),
            ...(dto.branchId !== undefined && { branchId: dto.branchId }),
            ...(dto.receiptUrl !== undefined && { receiptUrl: dto.receiptUrl }),
            ...(dto.relatedUserId !== undefined && { relatedUserId: dto.relatedUserId }),
          },
        });

        if (financialFieldChanged) {
          // Ledger is append-only (F.2): reverse the original entry and post
          // a new one with the updated figures instead of mutating the old
          // Transaction row. Legacy expenses without a ledger entry
          // (pre-C.2) get the new entry only — nothing to reverse.
          const originalEntry = await tx.transaction.findFirst({
            where: {
              expenseId: id,
              type: 'EXPENSE',
              reversedTransactionId: null,
            },
            select: { id: true },
          });

          if (originalEntry) {
            await this.transactionsService.reverseTransaction(
              originalEntry.id,
              { performedById: userId, reason: "Xarajat yangilandi" },
              tx,
            );
          }

          await this.transactionsService.recordExpense(
            {
              expenseId: updated.id,
              amount: updated.amount,
              companyId: updated.companyId,
              branchId: updated.branchId ?? undefined,
              performedById: userId,
              relatedUserId: updated.relatedUserId ?? undefined,
              description: updated.description,
            },
            tx,
          );
        }

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.entityHistoryService.recordUpdate({
      entityType: 'Expense',
      entityId: id,
      oldValues: existing,
      newValues: expense,
      changedById: userId,
      companyId: existing.companyId,
    });

    return expense;
  }

  async remove(id: string, userId: number, companyId: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    // Find the associated EXPENSE ledger entry so we can reverse it.
    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        expenseId: id,
        type: 'EXPENSE',
        reversedTransactionId: null,
      },
      select: { id: true },
    });

    // Atomic: reverse the ledger entry and soft-delete the expense together.
    await this.prisma.$transaction(
      async (tx) => {
        if (ledgerEntry) {
          await this.transactionsService.reverseTransaction(
            ledgerEntry.id,
            { performedById: userId, reason: "Xarajat o'chirildi" },
            tx,
          );
        }

        await tx.expense.update({
          where: { id },
          data: { deletedAt: new Date(), deletedById: userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { message: "Xarajat o'chirildi" };
  }
}
