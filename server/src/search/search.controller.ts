import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('quick')
  @Can('students.list', 'leads.view', 'teachers.view')
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
  @Can('students.list', 'leads.view', 'teachers.view')
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
