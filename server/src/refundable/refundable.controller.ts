import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BranchCeiling,
  BranchScope,
  CurrentUser,
  Roles,
} from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';
import { RefundableService } from './refundable.service';
import { RefundableQueryDto } from './dto/refundable-query.dto';

/**
 * «Qaytariladigan pul» reads (spec B2b §3, ADR-0076). Every staff role but
 * Teacher reads; the writes keep their own gates. Scope: the header branch.
 */
@Controller('refundable')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class RefundableController {
  constructor(private readonly refundable: RefundableService) {}

  @Get('list')
  list(
    @Query() q: RefundableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.refundable.list(companyId, scope, q);
  }

  @Get('excel')
  async excel(
    @Query() q: RefundableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.refundable.excel(
      companyId,
      scope,
      q,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('students/:id')
  student(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.refundable.student(companyId, scope, ceiling, id);
  }
}
