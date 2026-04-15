import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { Prisma } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateExpenseDto, userId: number, companyId: number) {
    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category,
        amount: dto.amount,
        description: dto.description,
        date: new Date(dto.date),
        branchId: dto.branchId,
        receiptUrl: dto.receiptUrl,
        createdById: userId,
        companyId,
      },
    });

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

  async update(id: string, dto: Partial<CreateExpenseDto>, userId: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.category && { category: dto.category }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description && { description: dto.description }),
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.receiptUrl !== undefined && { receiptUrl: dto.receiptUrl }),
      },
    });

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

  async remove(id: string, userId: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Xarajat topilmadi');

    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Xarajat o'chirildi" };
  }
}
