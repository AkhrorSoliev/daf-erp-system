import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Roles, CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('quick')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  quickSearch(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: { id: number; roles: string[]; companyId: number },
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.searchService.quickSearch(query.search, {
      companyId: user.companyId,
      roles: user.roles,
      userId: user.id,
      branchScope,
    });
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  fullSearch(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: { id: number; roles: string[]; companyId: number },
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.searchService.fullSearch(
      query.search,
      {
        companyId: user.companyId,
        roles: user.roles,
        userId: user.id,
        branchScope,
      },
      query.type,
      query.page,
      query.pageSize,
    );
  }
}
