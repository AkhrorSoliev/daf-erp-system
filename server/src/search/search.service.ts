import { Injectable, Logger } from '@nestjs/common';
import { SearchPeopleService } from './search-people.service';
import { SearchContentService } from './search-content.service';
import { CategoryResult, SearchContext } from './shared/search-helpers';

export type {
  SearchItem,
  SearchContext,
  CategoryResult,
} from './shared/search-helpers';

export interface QuickSearchResult {
  students: CategoryResult;
  users: CategoryResult;
  teachers: CategoryResult;
  groups: CategoryResult;
  courses: CategoryResult;}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private people: SearchPeopleService,
    private content: SearchContentService,
  ) {}

  async quickSearch(
    search: string,
    ctx: SearchContext,
  ): Promise<QuickSearchResult> {
    const start = Date.now();
    const trimmed = search.trim();
    const branchIds = ctx.branchScope;

    const [students, users, teachers, groups, courses] = await Promise.all([
      this.people.searchStudents(trimmed, ctx.companyId, branchIds, 5),
      this.people.searchUsers(trimmed, ctx.companyId, branchIds, 5),
      this.people.searchTeachers(trimmed, ctx.companyId, branchIds, 5),
      this.content.searchGroups(trimmed, ctx.companyId, branchIds, 5),
      this.content.searchCourses(trimmed, ctx.companyId, branchIds, 5),
    ]);

    const elapsed = Date.now() - start;
    if (elapsed > 500) {
      this.logger.warn(
        `Global search took ${elapsed}ms for query "${trimmed}"`,
      );
    }

    return { students, users, teachers, groups, courses };
  }

  async fullSearch(
    search: string,
    ctx: SearchContext,
    type?: string,
    page: number = 1,
    pageSize: number = 10,
  ) {
    const trimmed = search.trim();
    const skip = (page - 1) * pageSize;
    const branchIds = ctx.branchScope;
    const start = Date.now();

    let result: CategoryResult = { items: [], total: 0 };

    switch (type) {
      case 'students':
        result = await this.people.fullSearchStudents(
          trimmed,
          ctx.companyId,
          branchIds,
          skip,
          pageSize,
        );
        break;
      case 'users':
        result = await this.people.fullSearchUsers(
          trimmed,
          ctx.companyId,
          branchIds,
          skip,
          pageSize,
        );
        break;
      case 'teachers':
        result = await this.people.fullSearchTeachers(
          trimmed,
          ctx.companyId,
          branchIds,
          skip,
          pageSize,
        );
        break;
      case 'groups':
        result = await this.content.fullSearchGroups(
          trimmed,
          ctx.companyId,
          branchIds,
          skip,
          pageSize,
        );
        break;
      case 'courses':
        result = await this.content.fullSearchCourses(
          trimmed,
          ctx.companyId,
          branchIds,
          skip,
          pageSize,
        );
        break;
    }

    const elapsed = Date.now() - start;
    if (elapsed > 500) {
      this.logger.warn(
        `Full search took ${elapsed}ms for query "${trimmed}" type="${type}"`,
      );
    }

    return { data: result.items, total: result.total, page, pageSize };
  }

}
