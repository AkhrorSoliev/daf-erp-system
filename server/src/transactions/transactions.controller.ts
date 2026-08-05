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
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { DebtWriteOffQueryDto } from './dto/debt-write-off-query.dto';
import { CurrentUser, Roles, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('transactions')
@UseGuards(RolesGuard)
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(
    @Query() query: TransactionQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.transactionsService.findAll(query, companyId, branchIds);
  }

  @Get('student/:studentId')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
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
  @Roles('CEO', 'Branch Director', 'Administrator')
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

  // Audit log for the "yo'qolgan o'quvchi" write-off flow. CEO sees the
  // whole company; Branch Director is auto-scoped to their UserBranch
  // rows. Cashier/Teacher have no business reading financial corrections,
  // hence the explicit role list.
  @Get('debt-write-offs')
  @Roles('CEO', 'Branch Director')
  async findDebtWriteOffs(
    @Query() query: DebtWriteOffQueryDto,
    @CurrentUser()
    user: { id: number; companyId: number; roles: string[] },
  ) {
    const branchIds = await this.resolveBranchScopeForUser(user);
    return this.transactionsService.findDebtWriteOffs(user.companyId, {
      branchId: query.branchId,
      branchIds: branchIds ?? undefined,
      performedById: query.performedById,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
      includeReversed: query.includeReversed === 'true',
    });
  }

  /**
   * CEO: full company access (null = no branch filter).
   * Branch Director: explicit UserBranch rows.
   */
  private async resolveBranchScopeForUser(user: {
    id: number;
    roles: string[];
  }): Promise<number[] | null> {
    if (user.roles.includes('CEO')) return null;
    const rows = await this.prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    return rows.map((r) => r.branchId);
  }
}
