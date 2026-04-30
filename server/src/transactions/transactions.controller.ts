import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('transactions')
@UseGuards(RolesGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.transactionsService.findAll(query, companyId);
  }

  @Get('student/:studentId')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.transactionsService.findByStudent(studentId, query, companyId);
  }

  // FAZA 6.2 — Lesson trail (per-student "where did each so'm go?" report).
  // Cashier reads it too because they need to explain ledger gaps to
  // confused students at the front desk.
  @Get('student/:studentId/lesson-trail')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getLessonTrail(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('contractId') contractId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.transactionsService.getLessonTrail(studentId, companyId, {
      contractId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('teacher/:teacherId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  findByTeacher(
    @Param('teacherId', ParseIntPipe) teacherId: number,
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.transactionsService.findByTeacher(teacherId, query, companyId);
  }

  @Post('adjustment')
  @Roles('CEO', 'Branch Director')
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.transactionsService.createAdjustment({
      studentId: dto.studentId,
      amount: dto.amount,
      description: dto.description,
      branchId: dto.branchId,
      companyId,
      performedById: userId,
    });
  }
}
