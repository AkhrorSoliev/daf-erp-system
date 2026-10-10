import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

@Controller('expenses')
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private prisma: PrismaService,
  ) {}

  /**
   * The caller's branch ceiling intersected with the branch they picked.
   *
   * The list, the summary cards and the PDF used to filter on `query.branchId`
   * alone, so a Branch Director's own confinement was never applied: Namangan's
   * director opened /payments/expenses and saw Fargona's 20 377 000 so'm.
   */
  private async scope(
    userId: number,
    requestedBranchId?: number,
  ): Promise<ReportBranchIds> {
    const ids = await resolveCallerReportBranchIds(
      this.prisma,
      userId,
      requestedBranchId,
    );
    if (isEmptyScope(ids)) {
      throw new ForbiddenException(
        "Bu filial xarajatlarini ko'rish huquqingiz yo'q",
      );
    }
    return ids;
  }

  @Post()
  @Can('expenses.manage')
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.create(dto, userId, companyId);
  }

  @Get()
  @Can('expenses.view')
  async findAll(
    @Query() query: ExpenseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.expensesService.findAll(
      query,
      companyId,
      await this.scope(userId, query.branchId),
    );
  }

  // Filtered expenses as a downloadable PDF (same filters as the list, no
  // pagination). Gated by `expenses.view`; the frontend fetches it as a blob
  // (an <a href> can't carry the JWT). No dynamic ':id' GET exists, so the
  // literal 'pdf' path never collides.
  @Get('pdf')
  @Can('expenses.view')
  async exportPdf(
    @Query() query: ExpenseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.expensesService.generateExpensesPdf(
      query,
      companyId,
      await this.scope(userId, query.branchId),
    );
    const filename = `xarajatlar-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Patch(':id')
  @Can('expenses.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Can('expenses.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.remove(id, userId, companyId);
  }
}
