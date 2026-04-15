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
  @Roles('CEO', 'Branch Director')
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

  @Get('teacher/:teacherId')
  @Roles('CEO', 'Branch Director')
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
