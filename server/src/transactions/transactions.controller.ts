import {
  ForbiddenException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { DebtWriteOffQueryDto } from './dto/debt-write-off-query.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Can('reports.finance')
  findAll(
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.transactionsService.findAll(query, companyId, branchIds);
  }

  @Get('student/:studentId')
  @Can('students.details')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.transactionsService.findByStudent(
      studentId,
      query,
      companyId,
      branchIds,
    );
  }

  // FAZA 6.2 — Lesson trail (per-student "where did each so'm go?" report).
  // Gated by `students.details`, like the rest of the student's ledger. No
  // screen calls it now.
  @Get('student/:studentId/lesson-trail')
  @Can('students.details')
  getLessonTrail(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('contractId') contractId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.transactionsService.getLessonTrail(
      studentId,
      companyId,
      branchIds,
      {
        contractId,
        from,
        to,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
    );
  }

  @Get('teacher/:teacherId')
  @Can('salary.view')
  findByTeacher(
    @Param('teacherId', ParseIntPipe) teacherId: number,
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.transactionsService.findByTeacher(
      teacherId,
      query,
      companyId,
      branchIds,
    );
  }

  @Post('adjustment')
  @Can('balance.adjust')
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

  // Audit log for the "yo'qolgan o'quvchi" write-off flow, a tab of the debt
  // page (`debt.view`). A caller with the company-wide scope sees the whole
  // company; a branch-confined one is auto-scoped to their own branches.
  @Get('debt-write-offs')
  @Can('debt.view')
  async findDebtWriteOffs(
    @Query() query: DebtWriteOffQueryDto,
    @CurrentUser()
    user: { id: number; companyId: number; roles: string[] },
  ) {
    // The canonical resolver, same as every other money route — the local one
    // this replaced read `UserBranch` raw, so it missed `mainBranch`, and it
    // returned `[]` for a branch-less non-CEO. An empty array then met a
    // `branchIds.length > 0` check downstream and produced NO branch predicate
    // at all: the caller with no branch saw every branch. ADR-0002 says an
    // unknown scope must never read as "all" on a path that moves money.
    const branchIds = await resolveCallerReportBranchIds(
      this.prisma,
      user.id,
      query.branchId,
    );
    if (isEmptyScope(branchIds)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return this.transactionsService.findDebtWriteOffs(user.companyId, {
      branchIds,
      performedById: query.performedById,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
      includeReversed: query.includeReversed === 'true',
    });
  }
}
