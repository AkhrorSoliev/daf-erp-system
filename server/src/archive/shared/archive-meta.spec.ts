import 'reflect-metadata';
import { ArchiveEntityType } from '../dto/archive-query.dto';
import { getSearchFilter } from './archive-meta';

describe('getSearchFilter', () => {
  /**
   * `User` has no `name` column (only firstName/lastName), so filtering on
   * `name` made every archive search for staff blow up with a Prisma
   * validation error. Search must span both name halves like students do.
   */
  it('searches users across firstName and lastName', () => {
    expect(getSearchFilter(ArchiveEntityType.USERS, 'ali')).toEqual({
      OR: [
        { firstName: { contains: 'ali', mode: 'insensitive' } },
        { lastName: { contains: 'ali', mode: 'insensitive' } },
      ],
    });
  });

  it('still filters name-bearing entities by name', () => {
    expect(getSearchFilter(ArchiveEntityType.GROUPS, 'a1')).toEqual({
      name: { contains: 'a1', mode: 'insensitive' },
    });
  });
});
