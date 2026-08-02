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
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

@Controller('expenses')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
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
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.create(dto, userId, companyId);
  }

  @Get()
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
  // pagination). Auth-gated by the class-level @Roles; the frontend fetches it
  // as a blob (an <a href> can't carry the JWT). No dynamic ':id' GET exists,
  // so the literal 'pdf' path never collides.
  @Get('pdf')
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
  @Roles('CEO', 'Branch Director')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateExpenseDto>,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Roles('CEO', 'Branch Director')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.remove(id, userId, companyId);
  }
}
