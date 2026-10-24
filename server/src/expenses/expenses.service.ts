import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PermissionsService } from '../common/permissions/permissions.service';
import type { PermissionKey } from '../common/permissions/permission-catalog';
import { ExpenseCategory, ExpensePaymentMethod, Prisma } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { equalsOrIn } from '../common/dto/to-array';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { resolvePeriod } from '../common/finance/period-helpers';
import {
  assertCallerInBranch,
  resolveCallerBranchScope,
} from '../common/auth/branch-scope';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { renderPdf } from '../receipts/pdf/render';
import { buildExpensesDoc, type ExpensesPdfRow } from './pdf/expenses-template';
import { formatDate } from './pdf/format.util';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { expenseHint } from './expense-hints';
import {
  expenseMonthTitle,
  expenseMonthWindow,
  parseExpenseMonth,
} from './expenses-month';

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
  CASH: 'Naqd',
  CARD: 'Karta',
};

// CEO decision (10.10.2026): an advance to yourself is written, changed and
// deleted by another manager; only the CEO handles their own.
const OWN_ADVANCE_REFUSAL =
  "O'zingizga yozilgan avansni o'zingiz yoza, o'zgartira yoki o'chira olmaysiz — buni boshqa rahbar qiladi.";

// An advance is settled against its recipient's payroll, so it is booked in a
// branch the recipient belongs to.
const RECIPIENT_OTHER_BRANCH =
  "Bu xodim tanlangan filialga biriktirilmagan — avansni xodimning o'z filialida yozing.";

// ADR-0087 (CEO, 10.10 and 11.10.2026): an advance is cut from its
// recipient's salary, so it is written with «Oylik va avans to'lash»
// (`salary.pay`) alone; every other category with «Xarajat kiritish»
// (`expenses.manage`).
const EXPENSE_WRITE_REFUSAL = "Bu xarajatni kiritish huquqingiz yo'q";

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
    private permissions: PermissionsService,
  ) {}

  /**
   * The one place the category rule lives (ADR-0087): TEACHER_ADVANCE
   * requires `salary.pay`, every other category `expenses.manage`. Runs before
   * any other check, so a caller who may not write the category learns
   * nothing about branches or recipients.
   */
  private async assertMayWrite(
    userId: number,
    category: ExpenseCategory,
  ): Promise<void> {
    const key: PermissionKey =
      category === ExpenseCategory.TEACHER_ADVANCE
        ? 'salary.pay'
        : 'expenses.manage';
    if (!(await this.permissions.has(userId, key))) {
      throw new ForbiddenException(EXPENSE_WRITE_REFUSAL);
    }
  }

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

  /**
   * TEACHER_ADVANCE oluvchi xodimni nomlashi shart, va u xodim shu kompaniyada
   * bo'lishi kerak. `create` va `update` (bir qator avansga aylantirilganda)
   * uchun bitta joy — ikki nusxa muqarrar ravishda bir-biridan ajralib
   * ketardi.
   */
  private async assertAdvanceRecipient(
    relatedUserId: number | null | undefined,
    branchId: number,
    userId: number,
    companyId: number,
  ): Promise<void> {
    if (!relatedUserId) {
      throw new BadRequestException('Avans uchun xodimni tanlang');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: relatedUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Xodim topilmadi');
    }
    await this.assertNotOwnAdvance(relatedUserId, userId);
    await this.assertRecipientInBranch(relatedUserId, branchId);
  }

  /**
   * Your own advance is written, changed and deleted by another manager
   * (CEO decision, 10.10.2026). The CEO is the one caller whose scope is
   * `all`, and the only one who may handle their own.
   */
  private async assertNotOwnAdvance(
    recipientId: number | null,
    userId: number,
  ): Promise<void> {
    if (recipientId !== userId) return;
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    if (scope.kind !== 'all') {
      throw new ForbiddenException(OWN_ADVANCE_REFUSAL);
    }
  }

  /**
   * The advance is settled against the recipient's payroll, so their
   * `mainBranch ∪ UserBranch` must include the expense's branch. Otherwise
   * one branch's kassa and P&L carry it while another branch's payroll is
   * cut. A rule about the record, so the CEO is held to it too; a CEO
   * recipient spans every branch.
   */
  private async assertRecipientInBranch(
    recipientId: number,
    branchId: number,
  ): Promise<void> {
    const scope = await resolveCallerBranchScope(this.prisma, recipientId);
    if (scope.kind === 'branches' && !scope.branchIds.includes(branchId)) {
      throw new BadRequestException(RECIPIENT_OTHER_BRANCH);
    }
  }

  /**
   * Oylikdan ushlab qolingan avans qulflanadi. `applyPendingAdvances` uni
   * bitta SalaryPayment'ga bog'lab, o'sha to'lov summasini aynan shu avans
   * miqdoriga kamaytirgan. Endi summasini o'zgartirish yoki o'chirish o'sha
   * to'lovni eski raqam bo'yicha qoldiradi — oylik varaqasidagi
   * «grossTotal − avanslar = to'langan» tenglama buziladi. Tuzatishning
   * yagona to'g'ri yo'li: avval o'sha oylikni bekor qilish.
   *
   * Only an advance dated before the period end is ever netted (ADR-0082): a
   * later one stays unsettled, and editable, until its own month is settled —
   * or a later month, if it does not fit.
   */
  private assertAdvanceUnsettled(expense: {
    settledBySalaryPaymentId: string | null;
  }): void {
    if (expense.settledBySalaryPaymentId !== null) {
      throw new ConflictException(
        "Bu avans oylikka hisoblangan — o'zgartirib bo'lmaydi. Avval o'sha oylikni bekor qiling.",
      );
    }
  }

  /**
   * The channel a MARKETING expense paid for (ADR-0109). Only MARKETING rows
   * carry one, and it must be a live lead source of this company: the marketing
   * report joins spend to leads by it.
   */
  private async assertLeadSource(
    leadSourceId: string | null | undefined,
    category: ExpenseCategory,
    companyId: number,
  ): Promise<void> {
    if (leadSourceId == null) return;
    if (category !== ExpenseCategory.MARKETING) {
      throw new BadRequestException(
        'Manba (kanal) faqat marketing xarajatiga yoziladi',
      );
    }
    const source = await this.prisma.leadSource.findFirst({
      where: { id: leadSourceId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!source) throw new BadRequestException('Manba topilmadi');
  }

  async create(dto: CreateExpenseDto, userId: number, companyId: number) {
    await this.assertMayWrite(userId, dto.category);
    await this.assertBranchWritable(dto.branchId, companyId, userId);
    await this.assertLeadSource(dto.leadSourceId, dto.category, companyId);

    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(
        dto.relatedUserId,
        dto.branchId,
        userId,
        companyId,
      );
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
            leadSourceId: dto.leadSourceId ?? null,
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
      ...(query.createdById?.length && {
        createdById: equalsOrIn(query.createdById),
      }),
      date: this.dateWhere(query),
    };
  }

  /**
   * The month a read covers (spec B6 §4.1): `oy`, or the current Tashkent month
   * when neither `oy` nor the old range is sent. `null` = the old
   * `startDate`/`endDate` range, kept for a client still on the old page.
   */
  private monthOf(query: ExpenseQueryDto): string | null {
    const legacy = Boolean(query.startDate || query.endDate);
    if (query.oy && legacy) {
      throw new BadRequestException(
        "Oy yoki sana oralig'i — ikkalasi birga emas",
      );
    }
    return legacy ? null : parseExpenseMonth(query.oy, new Date());
  }

  // `Expense.date` is a date-only column: the month is [1st, next 1st); the old
  // range keeps its midnight `lte` (either bound works on its own).
  private dateWhere(query: ExpenseQueryDto): {
    gte?: Date;
    lt?: Date;
    lte?: Date;
  } {
    const month = this.monthOf(query);
    if (month) return expenseMonthWindow(month);
    return {
      ...(query.startDate && { gte: utcMidnightFromDateStr(query.startDate) }),
      ...(query.endDate && { lte: utcMidnightFromDateStr(query.endDate) }),
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
    leadSource: { select: { id: true, name: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  } satisfies Prisma.ExpenseSelect;

  // Newest first; `createdAt` and `id` keep one day's rows from jumping between pages.
  private readonly listOrder = [
    { date: 'desc' },
    { createdAt: 'desc' },
    { id: 'desc' },
  ] satisfies Prisma.ExpenseOrderByWithRelationInput[];

  async findAll(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where = this.buildWhere(query, companyId, branchIds);

    const [rows, total, byCatMethod] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: this.listSelect,
        orderBy: this.listOrder,
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
    // headline totals (Jami / Naqd / Karta) are the pure operational spend and
    // `advancesTotal` here is always 0 (kept for response-shape stability).
    const sumWhere = (
      pred: (g: (typeof byCatMethod)[number]) => boolean,
    ): number =>
      byCatMethod.reduce((s, g) => (pred(g) ? s + (g._sum.amount ?? 0) : s), 0);
    const isAdvance = (g: (typeof byCatMethod)[number]) =>
      g.category === ExpenseCategory.TEACHER_ADVANCE;

    return {
      data: rows.map((r) => ({ ...r, hint: expenseHint(r) })),
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
      orderBy: this.listOrder,
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
      date: { gte: period.startDate, lte: period.endDate },
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
  ): Promise<{ buffer: Buffer; filename: string }> {
    // One month per request: rows, title and file name all name this one.
    const month = this.monthOf(query);
    const monthQuery = month ? { ...query, oy: month } : query;
    const [rows, company, branch, creators] = await Promise.all([
      this.exportAll(monthQuery, companyId, branchIds),
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
      // «Kim kiritgan: …» names the people the list was filtered by.
      query.createdById?.length
        ? this.prisma.user.findMany({
            where: { id: { in: query.createdById }, companyId },
            select: { firstName: true, lastName: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    const pdfRows: ExpensesPdfRow[] = rows.map((r) => ({
      date: r.date,
      categoryLabel: CATEGORY_LABELS[r.category] ?? r.category,
      description: r.description,
      amount: r.amount,
      methodLabel: METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod,
      createdByName: `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim(),
    }));

    // Totals mirror the on-screen summary: the Jami / Naqd / Karta figures
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
      dateRangeLabel: month
        ? expenseMonthTitle(month)
        : buildDateRangeLabel(query.startDate, query.endDate),
      creatorLabel: creators.length
        ? creators.map((u) => `${u.firstName} ${u.lastName}`.trim()).join(', ')
        : null,
      generatedAt: new Date(),
      rows: pdfRows,
      totals,
    });

    return {
      buffer: await renderPdf(doc),
      filename: `xarajatlar-${month ?? tashkentDateStr(new Date())}.pdf`,
    };
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    userId: number,
    companyId: number,
  ) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null, companyId },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    // The category it is now, and the one it becomes: rent turned into an
    // advance needs both keys.
    await this.assertMayWrite(userId, existing.category);
    if (dto.category !== undefined && dto.category !== existing.category) {
      await this.assertMayWrite(userId, dto.category);
    }

    // Both sides: the caller must own the branch the row is IN, and the branch
    // they are moving it TO. Checking only the target would let someone reach
    // into the other branch's books to move a cost out of them.
    await this.assertBranchWritable(existing.branchId, companyId, userId);
    if (dto.branchId != null && dto.branchId !== existing.branchId) {
      await this.assertBranchWritable(dto.branchId, companyId, userId);
    }

    // Avans qoidalari. Xodimni almashtirish va toifani o'zgartirish ataylab
    // taqiqlangan: pul bir xodimdan ikkinchisiga jimgina ko'chib qolmasin,
    // tarixda ikkita aniq harakat (o'chirish + yangi avans) qolsin.
    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);

      if (
        dto.category !== undefined &&
        dto.category !== ExpenseCategory.TEACHER_ADVANCE
      ) {
        throw new BadRequestException(
          "Avansni boshqa toifaga o'tkazib bo'lmaydi — o'chirib, yangi xarajat yozing",
        );
      }
      if (
        dto.relatedUserId !== undefined &&
        dto.relatedUserId !== existing.relatedUserId
      ) {
        throw new BadRequestException(
          "Avansning xodimini almashtirib bo'lmaydi — o'chirib, to'g'ri xodimga yangi avans yozing",
        );
      }
      await this.assertNotOwnAdvance(existing.relatedUserId, userId);
      // Moving the advance to another branch must keep it in its recipient's.
      if (
        existing.relatedUserId != null &&
        dto.branchId != null &&
        dto.branchId !== existing.branchId
      ) {
        await this.assertRecipientInBranch(
          existing.relatedUserId,
          dto.branchId,
        );
      }
    } else if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(
        dto.relatedUserId,
        dto.branchId ?? existing.branchId,
        userId,
        companyId,
      );
    }

    // The channel follows the category (ADR-0109): a row that stops being
    // MARKETING loses it; a given one is checked against the category it gets.
    const nextCategory = dto.category ?? existing.category;
    await this.assertLeadSource(dto.leadSourceId, nextCategory, companyId);
    const leadSourceData: { leadSourceId?: string | null } =
      nextCategory !== ExpenseCategory.MARKETING
        ? existing.leadSourceId != null
          ? { leadSourceId: null }
          : {}
        : dto.leadSourceId !== undefined
          ? { leadSourceId: dto.leadSourceId }
          : {};

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
            ...leadSourceData,
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
    await this.assertMayWrite(userId, existing.category);

    // Delete REVERSES a ledger entry and moves cash back into the branch's
    // kassa, so it needs the same branch check as create/update.
    await this.assertBranchWritable(existing.branchId, companyId, userId);

    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);
      // Deleting your own advance keeps the cash and spares your salary the
      // cut: another manager's job too.
      await this.assertNotOwnAdvance(existing.relatedUserId, userId);
    }

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
