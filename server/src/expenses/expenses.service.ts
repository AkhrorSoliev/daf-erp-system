import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { ExpenseCategory, ExpensePaymentMethod, Prisma } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { renderPdf } from '../receipts/pdf/render';
import {
  buildExpensesDoc,
  type ExpensesPdfRow,
} from './pdf/expenses-template';
import { formatDate } from './pdf/format.util';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Ijara',
  UTILITIES: 'Kommunal',
  SUPPLIES: "Ta'minot",
  MARKETING: 'Marketing',
  TEACHER_ADVANCE: 'Ustozga avans',
  EQUIPMENT: 'Jihozlar',
  MAINTENANCE: "Ta'mirlash",
  TAXES: 'Soliqlar',
  OTHER: 'Boshqa',
};

const METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  CASH: 'Naqt',
  CARD: 'Karta',
};

// Human label for the PDF "Davr" line. Handles one-sided ranges.
function buildDateRangeLabel(start?: string, end?: string): string {
  if (start && end)
    return `${formatDate(new Date(start))} — ${formatDate(new Date(end))}`;
  if (start) return `${formatDate(new Date(start))} dan`;
  if (end) return `${formatDate(new Date(end))} gacha`;
  return 'Butun davr';
}

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
            paymentMethod: dto.paymentMethod,
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
            paymentMethod: dto.paymentMethod,
          },
          tx,
        );

        await this.entityHistoryService.recordCreate({
          entityType: 'Expense',
          entityId: expense.id,
          newValues: expense,
          changedById: userId,
          companyId,
          tx,
        });

        return expense;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return expense;
  }

  // Shared filter builder for the paginated list, the summary aggregation, and
  // the CSV export — all three must scope to the SAME rows so the cards reconcile
  // with the table and the export matches what the user sees. `deletedAt: null`
  // keeps soft-deleted expenses out of every read.
  private buildWhere(
    query: ExpenseQueryDto,
    companyId: number,
  ): Prisma.ExpenseWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(query.category && { category: query.category }),
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
      ...(query.search && {
        description: { contains: query.search, mode: 'insensitive' },
      }),
      // Date is a date-only column, so a midnight `lte` correctly includes the
      // whole `endDate`. Either bound works on its own (one-sided range).
      ...((query.startDate || query.endDate) && {
        date: {
          ...(query.startDate && { gte: new Date(query.startDate) }),
          ...(query.endDate && { lte: new Date(query.endDate) }),
        },
      }),
    };
  }

  private readonly listSelect = {
    id: true,
    category: true,
    paymentMethod: true,
    amount: true,
    description: true,
    date: true,
    branchId: true,
    receiptUrl: true,
    createdAt: true,
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  } satisfies Prisma.ExpenseSelect;

  async findAll(query: ExpenseQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where = this.buildWhere(query, companyId);

    const [data, total, agg, byMethod] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: this.listSelect,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expense.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { amount: true },
      }),
    ]);

    // Summary spans the WHOLE filtered set (not just this page) so the cards
    // stay correct as the user pages through.
    const sumFor = (method: ExpensePaymentMethod) =>
      byMethod.find((g) => g.paymentMethod === method)?._sum.amount ?? 0;

    return {
      data,
      total,
      page,
      pageSize,
      summary: {
        totalAmount: agg._sum.amount ?? 0,
        count: total,
        cashTotal: sumFor(ExpensePaymentMethod.CASH),
        cardTotal: sumFor(ExpensePaymentMethod.CARD),
      },
    };
  }

  // Returns every row matching the current filters, ignoring pagination (the
  // list endpoint caps pageSize at 100). Reused by the PDF export.
  async exportAll(query: ExpenseQueryDto, companyId: number) {
    const where = this.buildWhere(query, companyId);
    return this.prisma.expense.findMany({
      where,
      select: this.listSelect,
      orderBy: { date: 'desc' },
    });
  }

  // Builds a simple, clean PDF of the filtered expenses (same filters as the
  // list). Reuses the receipts pdfmake infra (Inter font, A4). Auth-gated by
  // the controller; the frontend fetches it as a blob.
  async generateExpensesPdf(
    query: ExpenseQueryDto,
    companyId: number,
  ): Promise<Buffer> {
    const [rows, company, branch] = await Promise.all([
      this.exportAll(query, companyId),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      query.branchId
        ? this.prisma.branch.findFirst({
            where: { id: query.branchId, companyId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    const pdfRows: ExpensesPdfRow[] = rows.map((r) => ({
      date: r.date,
      categoryLabel: CATEGORY_LABELS[r.category] ?? r.category,
      description: r.description,
      amount: r.amount,
      methodLabel: METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod,
      createdByName: `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim(),
    }));

    const totals = {
      totalAmount: rows.reduce((s, r) => s + r.amount, 0),
      cashTotal: rows
        .filter((r) => r.paymentMethod === ExpensePaymentMethod.CASH)
        .reduce((s, r) => s + r.amount, 0),
      cardTotal: rows
        .filter((r) => r.paymentMethod === ExpensePaymentMethod.CARD)
        .reduce((s, r) => s + r.amount, 0),
      count: rows.length,
    };

    const doc = buildExpensesDoc({
      companyName: company?.name ?? 'DaF Sprachzentrum',
      branchName: branch?.name ?? null,
      categoryLabel: query.category
        ? (CATEGORY_LABELS[query.category] ?? query.category)
        : null,
      methodLabel: query.paymentMethod
        ? (METHOD_LABELS[query.paymentMethod] ?? query.paymentMethod)
        : null,
      search: query.search?.trim() || null,
      dateRangeLabel: buildDateRangeLabel(query.startDate, query.endDate),
      generatedAt: new Date(),
      rows: pdfRows,
      totals,
    });

    return renderPdf(doc);
  }

  async update(
    id: string,
    dto: Partial<CreateExpenseDto>,
    userId: number,
    companyId: number,
  ) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    // Detect if the change touches financial fields. Description/date/branch/
    // receiptUrl edits do not require a ledger correction; amount or category
    // changes must be reflected in Transaction or cash-flow reports drift.
    const amountChanged =
      dto.amount !== undefined && dto.amount !== existing.amount;
    const categoryChanged =
      dto.category !== undefined && dto.category !== existing.category;
    const relatedUserChanged =
      dto.relatedUserId !== undefined &&
      dto.relatedUserId !== existing.relatedUserId;
    const financialFieldChanged =
      amountChanged || categoryChanged || relatedUserChanged;

    const expense = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.expense.update({
          where: { id },
          data: {
            ...(dto.category && { category: dto.category }),
            ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
            ...(dto.amount !== undefined && { amount: dto.amount }),
            ...(dto.description && { description: dto.description }),
            ...(dto.date && { date: new Date(dto.date) }),
            ...(dto.branchId !== undefined && { branchId: dto.branchId }),
            ...(dto.receiptUrl !== undefined && { receiptUrl: dto.receiptUrl }),
            ...(dto.relatedUserId !== undefined && {
              relatedUserId: dto.relatedUserId,
            }),
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
              reversedAt: null,
            },
            select: { id: true },
          });

          if (originalEntry) {
            await this.transactionsService.reverseTransaction(
              originalEntry.id,
              { performedById: userId, reason: 'Xarajat yangilandi' },
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
              paymentMethod: updated.paymentMethod,
            },
            tx,
          );
        }

        await this.entityHistoryService.recordUpdate({
          entityType: 'Expense',
          entityId: id,
          oldValues: existing,
          newValues: updated,
          changedById: userId,
          companyId: existing.companyId,
          tx,
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

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
        reversedAt: null,
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

        // Audit trail: record the soft-delete so it shows in the expense's
        // history (was previously missing — delete left no EntityHistory row).
        await this.entityHistoryService.recordDelete({
          entityType: 'Expense',
          entityId: id,
          oldValues: existing,
          changedById: userId,
          companyId: existing.companyId,
          tx,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return { message: "Xarajat o'chirildi" };
  }
}
