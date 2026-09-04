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
import { equalsOrIn } from '../common/dto/to-array';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { resolvePeriod } from '../common/finance/period-helpers';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { renderPdf } from '../receipts/pdf/render';
import { buildExpensesDoc, type ExpensesPdfRow } from './pdf/expenses-template';
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

  /**
   * The named branch must exist, belong to this company, and be one the caller
   * may act on.
   *
   * `dto.branchId` was written onto the Expense row AND its ledger entry with no
   * check at all: a Fargona director could book a cost against Namangan (or
   * against a branch id that does not exist — the column has no FK), which lands
   * straight in that branch's P&L. D4 makes every expense exactly one branch's
   * cost, so getting it wrong is not a labelling error, it is a wrong profit
   * figure for two branches at once.
   */
  private async assertBranchWritable(
    branchId: number,
    companyId: number,
    userId: number,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Filial #${branchId} topilmadi`);
    }
    await assertCallerInBranch(
      this.prisma,
      userId,
      branchId,
      "Bu filialga xarajat yozish huquqingiz yo'q",
    );
  }

  async create(dto: CreateExpenseDto, userId: number, companyId: number) {
    await this.assertBranchWritable(dto.branchId, companyId, userId);

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
  /**
   * Avans (`TEACHER_ADVANCE`) bu ro'yxatga hech qachon tushmaydi — u Ish haqi
   * sahifasida boshqariladi. Shuning uchun tanlangan toifalardan avval avans
   * olib tashlanadi; agar tanlovdan boshqa hech narsa qolmasa, filtr yo'q
   * hisoblanadi va avansni chiqarib tashlaydigan odatiy shart ishlaydi.
   */
  private categoryWhere(
    selected: ExpenseCategory[] | undefined,
  ): Prisma.ExpenseWhereInput {
    const withoutAdvance = (selected ?? []).filter(
      (c) => c !== ExpenseCategory.TEACHER_ADVANCE,
    );
    return withoutAdvance.length > 0
      ? { category: equalsOrIn(withoutAdvance) }
      : { category: { not: ExpenseCategory.TEACHER_ADVANCE } };
  }

  private buildWhere(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Prisma.ExpenseWhereInput {
    return {
      companyId,
      deletedAt: null,
      // Every expense belongs to exactly one branch, and each branch's profit
      // is its own income minus its OWN costs (docs/branch-decisions.md D4).
      // The scope is resolved from the CALLER plus the branch they picked —
      // taking `query.branchId` alone ignored a Branch Director's own
      // confinement, so a Namangan director's page showed Fargona's 20 377 000
      // so'm while the workbook's Xarajatlar sheet, scoped the other way,
      // showed 0 for the same period.
      ...branchIdWhere(branchIds),
      // TEACHER_ADVANCE is managed on the Ish haqi (salary) page now — advances
      // never surface in the expenses list / summary / PDF. Any other category
      // filter still applies; without one we simply exclude advances.
      ...this.categoryWhere(query.category),
      ...(query.paymentMethod?.length && {
        paymentMethod: equalsOrIn(query.paymentMethod),
      }),
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

  async findAll(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where = this.buildWhere(query, companyId, branchIds);

    const [data, total, byCatMethod] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: this.listSelect,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
      // One grouped scan over the WHOLE filtered set (not just this page) so
      // the cards stay correct while paging AND we can split the advance out.
      this.prisma.expense.groupBy({
        by: ['category', 'paymentMethod'],
        where,
        _sum: { amount: true },
      }),
    ]);

    // Advances are excluded from `where` (managed on the salary page), so the
    // headline totals (Jami / Naqt / Karta) are the pure operational spend and
    // `advancesTotal` here is always 0 (kept for response-shape stability).
    const sumWhere = (
      pred: (g: (typeof byCatMethod)[number]) => boolean,
    ): number =>
      byCatMethod.reduce((s, g) => (pred(g) ? s + (g._sum.amount ?? 0) : s), 0);
    const isAdvance = (g: (typeof byCatMethod)[number]) =>
      g.category === ExpenseCategory.TEACHER_ADVANCE;

    return {
      data,
      total,
      page,
      pageSize,
      summary: {
        totalAmount: sumWhere(() => true),
        count: total,
        cashTotal: sumWhere(
          (g) => g.paymentMethod === ExpensePaymentMethod.CASH,
        ),
        cardTotal: sumWhere(
          (g) => g.paymentMethod === ExpensePaymentMethod.CARD,
        ),
        // Ustozlar avansi — Jami summaga kiradi, alohida card sifatida ham
        // ko'rsatiladi.
        advancesTotal: sumWhere(isAdvance),
      },
    };
  }

  // Returns every row matching the current filters, ignoring pagination (the
  // list endpoint caps pageSize at 100). Reused by the PDF export.
  async exportAll(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const where = this.buildWhere(query, companyId, branchIds);
    return this.prisma.expense.findMany({
      where,
      select: this.listSelect,
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Every expense in the period for the Excel "Xarajatlar" line-item sheet.
   * Takes the SAME resolved scope as the page (`buildWhere`) and reuses the
   * shared `resolvePeriod` boundary, so the sheet reconciles with both the page
   * and the P&L expense figures. It used to let a Branch Director's `branchIds`
   * override the branch selected in the export dialog, which is how the same
   * period read 20 377 000 on screen and 0 in the workbook. Adds the
   * TEACHER_ADVANCE recipient (`relatedUser`) for the "Ustoz" column. Row list
   * is capped; `total`/`count` come from an aggregate so they stay exact.
   */
  async exportAllForReport(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const branch = branchIdWhere(query.branchIds);
    const where: Prisma.ExpenseWhereInput = {
      companyId,
      deletedAt: null,
      date: { gte: period.start, lte: period.endDate },
      ...branch,
    };

    const [rows, agg] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: {
          ...this.listSelect,
          relatedUser: { select: { firstName: true, lastName: true } },
        },
        orderBy: { date: 'desc' },
        take: 10_001,
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const truncated = rows.length > 10_000;
    return {
      rows: truncated ? rows.slice(0, 10_000) : rows,
      truncated,
      total: agg._sum.amount ?? 0,
      count: agg._count,
    };
  }

  // Builds a simple, clean PDF of the filtered expenses (same filters as the
  // list). Reuses the receipts pdfmake infra (Inter font, A4). Auth-gated by
  // the controller; the frontend fetches it as a blob.
  async generateExpensesPdf(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<Buffer> {
    const [rows, company, branch] = await Promise.all([
      this.exportAll(query, companyId, branchIds),
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

    // Totals mirror the on-screen summary: the Jami / Naqt / Karta figures
    // include every category (advance included), with the advance shown as a
    // separate "shundan Ustoz avansi" sub-line.
    const sumRows = (pred: (r: (typeof rows)[number]) => boolean): number =>
      rows.reduce((s, r) => (pred(r) ? s + r.amount : s), 0);
    const isAdvanceRow = (r: (typeof rows)[number]) =>
      r.category === ExpenseCategory.TEACHER_ADVANCE;

    const totals = {
      totalAmount: sumRows(() => true),
      cashTotal: sumRows((r) => r.paymentMethod === ExpensePaymentMethod.CASH),
      cardTotal: sumRows((r) => r.paymentMethod === ExpensePaymentMethod.CARD),
      advancesTotal: sumRows(isAdvanceRow),
      count: rows.length,
    };

    const doc = buildExpensesDoc({
      companyName: company?.name ?? 'DaF Sprachzentrum',
      branchName: branch?.name ?? null,
      // Bir nechta toifa tanlangan bo'lsa, sarlavhada hammasi sanaladi —
      // aks holda PDF bitta toifa bo'yicha filtrlanganday ko'rinadi.
      categoryLabel: joinLabels(query.category, CATEGORY_LABELS),
      methodLabel: joinLabels(query.paymentMethod, METHOD_LABELS),
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

    // Both sides: the caller must own the branch the row is IN, and the branch
    // they are moving it TO. Checking only the target would let someone reach
    // into the other branch's books to move a cost out of them.
    await this.assertBranchWritable(existing.branchId, companyId, userId);
    if (dto.branchId != null && dto.branchId !== existing.branchId) {
      await this.assertBranchWritable(dto.branchId, companyId, userId);
    }

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

    // Delete REVERSES a ledger entry and moves cash back into the branch's
    // kassa, so it needs the same branch check as create/update.
    await this.assertBranchWritable(existing.branchId, companyId, userId);

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

/** Tanlangan kalitlarni o'qiladigan yorliqlar qatoriga aylantiradi. */
function joinLabels(
  values: string[] | undefined,
  labels: Record<string, string>,
): string | null {
  if (!values?.length) return null;
  return values.map((v) => labels[v] ?? v).join(', ');
}
