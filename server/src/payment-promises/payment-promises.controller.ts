import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { PaymentPromisesService } from './payment-promises.service';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('payment-promises')
export class PaymentPromisesController {
  constructor(private readonly promises: PaymentPromisesService) {}

  @Post()
  @Can('debt.promise')
  create(
    @Body() dto: CreatePaymentPromiseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.promises.create(dto, userId, companyId, scope);
  }

  @Patch(':id/cancel')
  @Can('debt.promise')
  cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.promises.cancel(id, userId, companyId, scope);
  }

  /** This month's promise and the days a promise may name (ADR-0072). */
  @Get('month')
  @Can('debt.view', 'debt.promise', 'outreach.view')
  monthState(
    @Query('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.promises.monthState(studentId, companyId, scope);
  }

  @Get()
  @Can('debt.view', 'debt.promise', 'outreach.view')
  findByStudent(
    @Query('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.promises.findByStudent(studentId, companyId, scope);
  }
}
