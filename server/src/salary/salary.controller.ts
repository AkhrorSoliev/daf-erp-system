import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SalaryService } from './salary.service';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { BatchPayDto } from './dto/batch-pay.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('salary')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class SalaryController {
  constructor(private salaryService: SalaryService) {}

  // ===== CONFIG =====

  @Get('config/:userId')
  getConfig(@Param('userId', ParseIntPipe) userId: number) {
    return this.salaryService.getConfig(userId);
  }

  @Post('config')
  createConfig(
    @Body() dto: CreateSalaryConfigDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.createConfig(dto, companyId);
  }

  @Post('config/global')
  applyGlobalConfig(
    @Body() dto: GlobalSalaryConfigDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.applyGlobalConfig(dto, companyId);
  }

  @Patch('config/:id')
  updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryConfigDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.updateConfig(id, dto, companyId);
  }

  // ===== ACCRUALS =====

  @Get('accruals/:userId')
  getAccruals(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }

  // ===== PAYMENTS =====

  @Get('payments')
  findPayments(
    @Query() query: SalaryPaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.findPayments(query, companyId);
  }

  @Post('calculate')
  @Roles('CEO')
  calculateSalaries(@CurrentUser('companyId') companyId: number) {
    return this.salaryService.calculateMonthlySalaries(companyId);
  }

  @Patch('payments/:id/approve')
  @Roles('CEO')
  approvePayment(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.approvePayment(id, companyId);
  }

  @Post('payments/:id/pay')
  payPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.payPayment(id, userId, companyId);
  }

  @Post('payments/batch-pay')
  batchPay(
    @Body() dto: BatchPayDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.batchPay(
      {
        companyId,
        branchId: dto.branchId,
        userIds: dto.userIds,
        statuses: dto.statuses,
      },
      userId,
    );
  }
}
