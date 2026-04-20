import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('expenses')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
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

  @Patch(':id')
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateExpenseDto>,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Roles('CEO', 'Branch Director', 'Administrator')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.expensesService.remove(id, userId, companyId);
  }
}
