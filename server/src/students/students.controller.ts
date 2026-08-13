import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentEnrollmentService } from './student-enrollment.service';
import { SmsService } from '../sms/sms.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { RemoveFromGroupDto } from './dto/remove-from-group.dto';
import { WriteOffCycleDebtDto } from './dto/write-off-cycle-debt.dto';
import { EnrollToGroupDto } from './dto/enroll-to-group.dto';
import { DeleteStudentDto } from './dto/delete-student.dto';
import { SendSmsDto } from '../sms/dto/send-sms.dto';
import { InitialBalanceDto } from './dto/initial-balance.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  Roles,
  CurrentUser,
  STAFF_ROLES,
  BranchScope,
} from '../common/decorators';
import { RolesGuard } from '../common/guards';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { DebtAgeService } from '../common/finance/debt-age.service';

@Controller('students')
export class StudentsController {
  constructor(
    private studentsService: StudentsService,
    private studentEnrollmentService: StudentEnrollmentService,
    private smsService: SmsService,
    private transactionsService: TransactionsService,
    private debtAge: DebtAgeService,
  ) {}

  // Staff only. Without this the global JwtAuthGuard let ANY valid token —
  // including a student-portal one — pull every student's phone, parent phone,
  // address, passport series and balance. Teachers and cashiers legitimately
  // reach this (group screens, payment dialog); the teacher narrowing below
  // still confines a teacher to their own students.
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @Get()
  findAll(
    @Query() query: StudentQueryDto,
    @CurrentUser() currentUser: any,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    const roles: string[] = currentUser.roles ?? [];
    const isTeacherOnly =
      roles.includes('Teacher') &&
      !roles.some((r) =>
        ['CEO', 'Branch Director', 'Administrator'].includes(r),
      );
    if (isTeacherOnly) {
      query.teacher_id = currentUser.id;
    }
    return this.studentsService.findAll(
      query,
      currentUser.companyId,
      branchScope,
    );
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.studentsService.findById(id, companyId, branchScope);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateStudentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStudentStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.getStatusHistory(id, companyId, userId);
  }

  @Get(':id/active-enrollments-prepaid')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getActiveEnrollmentsWithPrepaid(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.getActiveEnrollmentsWithPrepaid(
      id,
      companyId,
      userId,
    );
  }

  /**
   * Aggregate ledger summary for the To'lovlar tab debt-explanation card.
   * Pure projection — no mutation. Cashier role is included because
   * cashiers see the same tab.
   */
  @Get(':id/balance-summary')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getBalanceSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.getBalanceSummary(id, companyId, userId);
  }

  @Post(':id/enroll')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  enrollToGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnrollToGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentEnrollmentService.enrollToGroup(
      id,
      dto.groupId,
      userId,
      companyId,
      {
        transferReasonId: dto.transferReasonId,
        startDate: dto.startDate,
      },
    );
  }

  @Delete(':id/enroll/:enrollmentId')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  removeFromGroup(
    @Param('id', ParseIntPipe) id: number,
    @Param('enrollmentId') enrollmentId: string,
    @Body() dto: RemoveFromGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentEnrollmentService.removeFromGroup(
      id,
      enrollmentId,
      userId,
      companyId,
      dto,
    );
  }

  // Closed enrollments (DROPPED / FROZEN) of a student — surfaces them
  // in the profile UI so admins can write off lingering current-cycle
  // debt on already-closed enrollments. The list is metadata only; per-
  // enrollment eligibility is fetched on-demand when the modal opens.
  @Get(':id/closed-enrollments')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getClosedEnrollments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.getClosedEnrollments(id, companyId, userId);
  }

  // O'quvchi monitoringi uchun "Darslar" ko'rinishi — har guruh bo'yicha
  // davomat (kelgan/kelmagan) + har dars qaysi siklga tegishli + sikl sana
  // oraliqlari. Operatsion monitoring bo'lgani uchun Cashier KIRITILMAYDI
  // (bu balance-summary/lesson-trail'dan ataylab farq qiladi).
  @Get(':id/lessons-overview')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getLessonsOverview(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeClosed') includeClosed: string | undefined,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.getLessonsOverview(
      id,
      companyId,
      includeClosed === 'true',
      userId,
    );
  }

  /**
   * "Qarzi qachondan beri va qaysi oylardan" for the profile page's balance
   * badge. Returns null when the student owes nothing.
   *
   * Same shared replay the debtors list and the center top-up tab read, so a
   * student's debt is not described one way on a list and another on their own
   * page. Read-only, and gated like the profile that shows it.
   */
  @Get(':id/debt-origin')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getDebtOrigin(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.debtAge.getForStudent(companyId, id, userId);
  }

  // Eligibility check for the "yo'qolgan o'quvchi" write-off flow. Returns
  // whether the student qualifies (joriy siklda PRESENT/LATE=0 + ABSENT>0
  // + balance<0) and the suggested write-off amount. Frontend uses this
  // to decide whether to render the write-off block inside the
  // remove-from-group dialog (ACTIVE) or as a button on the profile page
  // (DROPPED/FROZEN).
  @Get(':id/enrollments/:enrollmentId/debt-write-off-eligibility')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getDebtWriteOffEligibility(
    @Param('id', ParseIntPipe) id: number,
    @Param('enrollmentId') enrollmentId: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentEnrollmentService.getDebtWriteOffEligibility(
      id,
      enrollmentId,
      companyId,
      userId,
    );
  }

  // Standalone write-off for an enrollment that is already DROPPED/FROZEN.
  // Does NOT change enrollment status — purely a balance correction.
  // ACTIVE enrollments must use removeFromGroup with writeOffCycleDebt=true
  // so the audit trail captures one combined operation.
  @Post(':id/enrollments/:enrollmentId/write-off-cycle-debt')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  writeOffCycleDebt(
    @Param('id', ParseIntPipe) id: number,
    @Param('enrollmentId') enrollmentId: string,
    @Body() dto: WriteOffCycleDebtDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentEnrollmentService.writeOffDroppedEnrollmentDebt(
      id,
      enrollmentId,
      userId,
      companyId,
      dto,
    );
  }

  @Get(':id/sms')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getSmsHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.smsService.getByStudent(
      id,
      companyId,
      query.page,
      query.pageSize,
      userId,
    );
  }

  @Post(':id/sms')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  sendSms(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendSmsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.smsService.sendToStudent(
      id,
      dto.content,
      'MANUAL',
      userId,
      companyId,
      { assertCallerBranch: true },
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteStudentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.delete(id, userId, dto.reason, companyId);
  }

  // ===========================================================================
  // FAZA 6.1 — Initial balance.
  //
  // For centers transitioning to the new finance system: the CEO enters
  // each student's current outstanding balance once, and the system tracks
  // lesson-by-lesson from there. Enforced by a Postgres partial unique
  // index — only one INITIAL_BALANCE row per student.
  // ===========================================================================
  @Post(':id/initial-balance')
  @UseGuards(RolesGuard)
  @Roles('CEO')
  setInitialBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InitialBalanceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.setInitialBalance(id, dto, userId, companyId);
  }
}
