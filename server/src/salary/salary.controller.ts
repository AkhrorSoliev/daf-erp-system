import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { SalaryService } from './salary.service';
import { TeacherTimelineService } from './teacher-timeline.service';
import { SalaryBreakdownService } from './salary-breakdown.service';
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
import { SalaryPeriodSettingsService } from './salary-period-settings.service';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';
import { CreateSalaryPeriodSettingDto } from './dto/salary-period-setting.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { SalaryMatrixQueryDto } from './dto/salary-matrix-query.dto';
import { SalaryOverviewQueryDto } from './dto/salary-overview-query.dto';
import { SalaryStaffConfigQueryDto } from './dto/salary-staff-config-query.dto';
import { SalaryMonthlyQueryDto } from './dto/salary-monthly-query.dto';
import { SalaryCenterTopUpService } from './salary-center-topup.service';
import { SalaryStaffConfigService } from './salary-staff-config.service';
import { BatchPayDto } from './dto/batch-pay.dto';
import { SettleMonthDto } from './dto/settle-month.dto';
import { CalculateSalaryDto } from './dto/calculate-salary.dto';
import { parseTashkentDateStart } from './shared/resolve-current-period';
import { CurrentUser, BranchScope } from '../common/decorators';
import { singleBranchId } from '../common/finance/report-branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { AnyStaff, Can } from '../common/permissions/access.decorators';

@Controller('salary')
export class SalaryController {
  constructor(
    private salaryService: SalaryService,
    private timelineService: TeacherTimelineService,
    private breakdownService: SalaryBreakdownService,
    private periodSettingsService: SalaryPeriodSettingsService,
    private advanceCalendarService: SalaryAdvanceCalendarService,
    private centerTopUpService: SalaryCenterTopUpService,
    private staffConfigService: SalaryStaffConfigService,
  ) {}

  // =========================================================================
  // ME — endpoints any staff account can hit to see their own data.
  // The service is scoped by @CurrentUser('id') so a teacher cannot view
  // another teacher's data via these routes.
  // =========================================================================

  @Get('me/summary')
  @AnyStaff()
  getMySummary(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getTeacherSalarySummary(userId, companyId);
  }

  @Get('me/accruals')
  @AnyStaff()
  getMyAccruals(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }

  @Get('me/current-cycle/breakdown')
  @AnyStaff()
  getMyCurrentCycleBreakdown(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getCurrentCycleBreakdown(userId, companyId);
  }

  /**
   * "Mening oyligim" — the caller's own row from the monthly salary report.
   * Identical figures to what an admin sees on `/payments/salary`, because it
   * is literally the same pass narrowed to one user.
   */
  @Get('me/monthly')
  @AnyStaff()
  getMyMonthly(
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getMonthlyForUser(
      userId,
      query,
      companyId,
      userId,
    );
  }

  @Get('me/payments/:id/breakdown')
  @AnyStaff()
  getMyPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    // asUserId enforces ownership — teacher only sees their own.
    return this.breakdownService.getPaymentBreakdown(id, companyId, userId);
  }

  // =========================================================================
  // CONFIG — reading rates takes `salary.view`; saving one (`POST
  // /salary/config` and its preview) takes `salary.rate`, and which teacher a
  // Branch Director may touch is decided in SalaryService (ADR-0034). `PATCH`
  // and the company-wide bulk rate take `salary.rate-edit`.
  //
  // Everything the «Ish haqi» page reads takes `salary.view`: an Administrator
  // does not hold it by default (docs/role-access.md). One exception:
  // `timeline/:userId` (the teacher profile's «Taymlayn» tab) takes
  // `teachers.view`, because the profile page calls it.
  // =========================================================================

  @Get('config/:userId')
  @Can('salary.view')
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
  @Can('salary.view')
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
  @Can('salary.view')
  getConfigHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfigHistory(userId, companyId);
  }

  @Post('config')
  @Can('salary.rate')
  createConfig(
    @Body() dto: CreateSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.createConfig(dto, companyId, userId);
  }

  /**
   * What `POST /salary/config` would do to the lessons already written from
   * the rate's start date (ADR-0050) — the save runs and is rolled back.
   * Same body, same capability (`salary.rate`) and same caller gate as the save.
   */
  @Post('config/preview')
  @Can('salary.rate')
  previewConfig(
    @Body() dto: CreateSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.previewConfig(dto, companyId, userId);
  }

  @Post('config/global')
  @Can('salary.rate-edit')
  applyGlobalConfig(
    @Body() dto: GlobalSalaryConfigDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.applyGlobalConfig(dto, companyId, userId);
  }

  @Patch('config/:id')
  @Can('salary.rate-edit')
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
  @Can('teachers.view')
  getTimeline(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.timelineService.getTimeline(userId, companyId);
  }

  // =========================================================================
  // PERIOD SETTINGS — listing takes `salary.view`; saving takes `salary.close`.
  // =========================================================================

  @Get('period-settings')
  @Can('salary.view')
  listPeriodSettings(@CurrentUser('companyId') companyId: number) {
    return this.periodSettingsService.list(companyId);
  }

  @Post('period-settings')
  @Can('salary.close')
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
  @Can('salary.view')
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
  @Can('salary.view')
  findPayments(
    @Query() query: SalaryPaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.findPayments(query, companyId);
  }

  @Get('matrix')
  @Can('salary.view')
  getMatrix(
    @Query() query: SalaryMatrixQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getMatrix(query, companyId, userId);
  }

  /**
   * "Ustozlar oyligi" jonli ko'rinishi — har bir ustozning ayni vaqtdagi
   * oylik holati (profildagi summalar bilan bir xil). BD o'z filiali bilan
   * cheklangan.
   */
  @Get('overview')
  @Can('salary.view')
  getOverview(
    @Query() query: SalaryOverviewQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    // The last payroll endpoint that ignored the header. A confined caller was
    // always confined, but a CEO switching Fargona → Namangan watched
    // `/salary/monthly` change while this rate list kept showing every teacher
    // in the company — two payroll screens, one branch switch, two answers.
    //
    // `singleBranchId` for the same reason as `/salary/monthly`: the service
    // takes one branch, and the scope has already been intersected with the
    // caller's ceiling, so this can only narrow.
    return this.salaryService.getOverview(
      { ...query, branchId: singleBranchId(scope) },
      companyId,
      userId,
    );
  }

  /**
   * "Xodimlar stavkalari" — o'qituvchi bo'lmagan xodimlar (administrator,
   * kassir, filial direktori) va ularning hozirgi oylik stavkasi. ⚙ Sozlamalar
   * oynasidagi ro'yxat shu yerdan keladi.
   *
   * `/salary/overview` dan alohida: u ustozning darslari/accruallariga
   * qurilgan, FIXED_MONTHLY xodim uchun esa bu ustunlar ma'nosiz nol beradi.
   *
   * Takes `salary.view`, like the teacher rate list beside it: this list shows
   * the staff's own pay — the Branch Director's included — so an
   * Administrator, who does not hold `salary.view` by default, never sees it
   * (`docs/role-access.md`, "Salary config").
   */
  @Get('staff-config')
  @Can('salary.view')
  getStaffConfig(
    @Query() query: SalaryStaffConfigQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    // `singleBranchId` for the same reason as `/salary/overview`: the service
    // takes one branch, and the scope has already been intersected with the
    // caller's ceiling, so this can only narrow.
    return this.staffConfigService.listStaff(
      { ...query, branchId: singleBranchId(scope) },
      companyId,
      userId,
    );
  }

  /**
   * "Ustozlar oyligi" — tanlangan oy uchun har bir ustozning to'liq ishlangani,
   * o'quvchilar to'lagani, markaz qo'shimchasi (top-up) va avansi. BD o'z filiali
   * bilan cheklangan.
   */
  @Get('monthly')
  @Can('salary.view')
  getMonthly(
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    // The payroll resolver already honours a requested branch correctly — it
    // just never received one. `/salary/monthly` took no branch input at all,
    // so a CEO switching Fargona → Namangan saw the SAME company-wide numbers
    // under a header naming the branch they picked. This is the reports module's
    // "cover says one branch, totals say another" defect, still live in payroll.
    //
    // `singleBranchId` and not the raw header: the resolver takes one branch,
    // and the scope has already been intersected with the caller's ceiling, so
    // this can only narrow.
    return this.salaryService.getMonthly(
      { ...query, branchId: singleBranchId(scope) },
      companyId,
      userId,
    );
  }

  /**
   * "Qolgan (markaz)" drill-down — markaz qaysi o'quvchilar uchun ustozlarga
   * pul to'lab bergani va o'sha pul kimdan undirilishi kerakligi. Uni Ish haqi
   * sahifasining «Markaz qoplagani» tabi o'qiydi, shuning uchun u sahifaning
   * o'z huquqini oladi — `salary.view` (ADR-0072). Filial chegarasi
   * `resolveMonthlyScope` da.
   */
  @Get('monthly/center-topup')
  @Can('salary.view')
  getCenterTopUpStudents(
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    // Same `singleBranchId(scope)` narrowing as `/salary/monthly` — the card's
    // total and this list must be computed over one and the same branch scope.
    return this.centerTopUpService.getStudents(
      {
        ...query,
        allMonths: query.allMonths === 'true',
        branchId: singleBranchId(scope),
      },
      companyId,
      userId,
    );
  }

  /**
   * One named teacher's row from the monthly report — backs the profile
   * "Ish haqi" tab and the profile card's "To'lanishi kerak".
   *
   * Takes `salary.view`: this is one person's pay, so an Administrator does
   * not read it by default (the endpoint it replaces,
   * `/teachers/:id/salary-summary`, was closed to them too).
   */
  @Get('monthly/user/:userId')
  @Can('salary.view')
  getMonthlyForUser(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getMonthlyForUser(
      targetUserId,
      query,
      companyId,
      performedById,
    );
  }

  /**
   * Per-teacher advance breakdown for the "Avans" cell drawer on the salary
   * page — each TEACHER_ADVANCE given to the teacher in the selected month.
   */
  @Get('advances/:userId')
  @Can('salary.view')
  getAdvances(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('month') month: string | undefined,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAdvancesForUser(
      userId,
      { month },
      companyId,
      performedById,
    );
  }

  /**
   * Kunlik avans kalendari — «Avanslar» tabi. Tanlangan oydagi barcha
   * TEACHER_ADVANCE xarajatlari kun bo'yicha guruhlangan holda.
   *
   * Yo'l `advance-calendar`, `advances/calendar` EMAS: ikkinchisi yuqoridagi
   * `advances/:userId` marshrutiga tushib, ParseIntPipe'da 400 bo'lardi.
   *
   * `SalaryMonthlyQueryDto` qayta ishlatiladi (month regex allaqachon shu
   * yerda); undagi `search` bu endpoint uchun ma'nosiz, shuning uchun servisga
   * faqat `month` uzatiladi.
   */
  @Get('advance-calendar')
  @Can('salary.view')
  getAdvanceCalendar(
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.advanceCalendarService.getCalendar(
      { month: query.month },
      companyId,
      performedById,
    );
  }

  @Get('payments/:id/breakdown')
  @Can('salary.view')
  getPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getPaymentBreakdown(id, companyId);
  }

  /**
   * Preview which period a picked date settles — drives the calculate dialog so
   * the CEO sees the exact [start, end] window before triggering. Takes
   * `salary.close` to mirror the calculate action it precedes.
   */
  @Get('period-preview')
  @Can('salary.close')
  previewPeriod(
    @Query('asOfDate') asOfDate: string | undefined,
    @CurrentUser('companyId') companyId: number,
  ) {
    const ref = asOfDate ? parseTashkentDateStart(asOfDate) : new Date();
    return this.salaryService.previewPeriod(companyId, ref);
  }

  @Post('calculate')
  @Can('salary.close')
  calculateSalaries(
    @Body() dto: CalculateSalaryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.calculateMonthlySalaries(companyId, {
      asOfDate: dto.asOfDate ? parseTashkentDateStart(dto.asOfDate) : undefined,
    });
  }

  /**
   * What a month-wide settle would close, for the confirmation dialog: every
   * still-unpaid payroll row of the month, its total, and the branches whose
   * kassa the money leaves. Read-only.
   *
   * A dedicated endpoint rather than a reuse of `/salary/monthly`: that table
   * shows ONE payment per employee, and a re-calculated month legitimately
   * carries several rows per person (June 2026 has two for six teachers). The
   * dialog must list exactly what it is about to settle.
   *
   * Declared before the `:id` routes — Nest matches in declaration order, so a
   * literal segment has to come first if a parameterised sibling is ever added.
   */
  @Get('payments/settle-month/preview')
  @Can('salary.close')
  previewSettleMonth(
    @Query('month') month: string | undefined,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.salaryService.previewSettleMonth(month, companyId, userId);
  }

  /**
   * Mark a whole month's payroll PAID — for salaries handed over OUTSIDE the
   * system at the amounts the system had already calculated. Takes
   * `salary.close`: irreversible and month-wide. Settling a single employee
   * stays under `salary.pay` (`POST /salary/payments/:id/pay`).
   */
  @Post('payments/settle-month')
  @Can('salary.close')
  settleMonth(
    @Body() dto: SettleMonthDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.salaryService.settleMonth(dto, companyId, userId);
  }

  @Patch('payments/:id/approve')
  @Can('salary.close')
  approvePayment(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.approvePayment(id, companyId);
  }

  @Post('payments/:id/pay')
  @Can('salary.pay')
  payPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.payPayment(id, userId, companyId);
  }

  @Post('payments/batch-pay')
  @Can('salary.pay')
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
