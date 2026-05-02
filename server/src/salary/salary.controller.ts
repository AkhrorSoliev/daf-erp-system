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
import { TeacherTimelineService } from './teacher-timeline.service';
import { SalaryBreakdownService } from './salary-breakdown.service';
import { SalaryPeriodSettingsService } from './salary-period-settings.service';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';
import { CreateSalaryPeriodSettingDto } from './dto/salary-period-setting.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { BatchPayDto } from './dto/batch-pay.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('salary')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
export class SalaryController {
  constructor(
    private salaryService: SalaryService,
    private timelineService: TeacherTimelineService,
    private breakdownService: SalaryBreakdownService,
    private periodSettingsService: SalaryPeriodSettingsService,
  ) {}

  // =========================================================================
  // ME — endpoints any authenticated user can hit to see their own data.
  // The service is scoped by @CurrentUser('id') so a teacher cannot view
  // another teacher's data via these routes.
  // =========================================================================

  @Get('me/summary')
  getMySummary(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getTeacherSalarySummary(userId, companyId);
  }

  @Get('me/accruals')
  getMyAccruals(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }

  @Get('me/current-cycle/breakdown')
  getMyCurrentCycleBreakdown(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getCurrentCycleBreakdown(userId, companyId);
  }

  @Get('me/payments/:id/breakdown')
  getMyPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    // asUserId enforces ownership — teacher only sees their own.
    return this.breakdownService.getPaymentBreakdown(id, companyId, userId);
  }

  // =========================================================================
  // CONFIG — write = CEO-only; read = CEO/BD/Administrator.
  // =========================================================================

  @Get('config/:userId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getConfig(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfig(userId, companyId);
  }

  /**
   * Bulk fetch — `?userIds=1,2,3`. Powers the salary-config table summary
   * (current rate per row) without firing N requests from the frontend.
   */
  @Get('configs/by-users')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getConfigsForUsers(
    @Query('userIds') userIdsParam: string | undefined,
    @CurrentUser('companyId') companyId: number,
  ) {
    const userIds = (userIdsParam ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return this.salaryService.getConfigsForUsers(userIds, companyId);
  }

  @Get('config-history/:userId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getConfigHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfigHistory(userId, companyId);
  }

  @Post('config')
  @Roles('CEO')
  createConfig(
    @Body() dto: CreateSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.createConfig(dto, companyId, userId);
  }

  @Post('config/global')
  @Roles('CEO')
  applyGlobalConfig(
    @Body() dto: GlobalSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.applyGlobalConfig(dto, companyId, userId);
  }

  @Patch('config/:id')
  @Roles('CEO')
  updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.updateConfig(id, dto, companyId, userId);
  }

  // =========================================================================
  // TIMELINE — merged history (salary + group + profile) for one teacher.
  // =========================================================================

  @Get('timeline/:userId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getTimeline(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.timelineService.getTimeline(userId, companyId);
  }

  // =========================================================================
  // PERIOD SETTINGS — list = CEO/BD/Admin; write = CEO only.
  // =========================================================================

  @Get('period-settings')
  @Roles('CEO', 'Branch Director', 'Administrator')
  listPeriodSettings(@CurrentUser('companyId') companyId: number) {
    return this.periodSettingsService.list(companyId);
  }

  @Post('period-settings')
  @Roles('CEO')
  createPeriodSetting(
    @Body() dto: CreateSalaryPeriodSettingDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.periodSettingsService.create(dto, companyId, userId);
  }

  // =========================================================================
  // ACCRUALS — admin view of any teacher's accruals.
  // =========================================================================

  @Get('accruals/:userId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getAccruals(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }

  // =========================================================================
  // PAYMENTS — listing + breakdown drawer + cron triggers + payouts.
  // =========================================================================

  @Get('payments')
  @Roles('CEO', 'Branch Director', 'Administrator')
  findPayments(
    @Query() query: SalaryPaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.findPayments(query, companyId);
  }

  @Get('payments/:id/breakdown')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getPaymentBreakdown(id, companyId);
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
  @Roles('CEO', 'Branch Director')
  payPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.payPayment(id, userId, companyId);
  }

  @Post('payments/batch-pay')
  @Roles('CEO', 'Branch Director')
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
