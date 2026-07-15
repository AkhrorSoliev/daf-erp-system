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
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('expenses')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post()
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.create(dto, userId, companyId);
  }

  @Get()
  findAll(
    @Query() query: ExpenseQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.findAll(query, companyId);
  }

  // Filtered expenses as a downloadable PDF (same filters as the list, no
  // pagination). Auth-gated by the class-level @Roles; the frontend fetches it
  // as a blob (an <a href> can't carry the JWT). No dynamic ':id' GET exists,
  // so the literal 'pdf' path never collides.
  @Get('pdf')
  async exportPdf(
    @Query() query: ExpenseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.expensesService.generateExpensesPdf(
      query,
      companyId,
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
