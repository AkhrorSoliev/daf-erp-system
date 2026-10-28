import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { MonthCloseService } from './month-close.service';
import { SaveBankFeesDto } from './dto/save-bank-fees.dto';

@Controller('month-close')
@Can('settings.tax')
export class MonthCloseController {
  constructor(private readonly service: MonthCloseService) {}

  @Get(':month')
  read(
    @Param('month') month: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.read(companyId, month, scope, userId);
  }

  @Put(':month/bank-fees')
  saveBankFees(
    @Param('month') month: string,
    @Body() dto: SaveBankFeesDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.saveBankFees(
      companyId,
      month,
      dto.items,
      userId,
      scope,
    );
  }
}
