import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Roles, CurrentUser } from '../common/decorators';
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
  ) {
    return this.searchService.quickSearch(query.search, {
      companyId: user.companyId,
      roles: user.roles,
      userId: user.id,
    });
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  fullSearch(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: { id: number; roles: string[]; companyId: number },
  ) {
    return this.searchService.fullSearch(
      query.search,
      { companyId: user.companyId, roles: user.roles, userId: user.id },
      query.type,
      query.page,
      query.pageSize,
    );
  }
}
