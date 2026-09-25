import 'reflect-metadata';
import { ArchiveEntityType } from '../dto/archive-query.dto';
import { archiveScope, getSearchFilter } from './archive-meta';
import { STUDENT_ONLY_ACCOUNT } from '../../common/auth/student-account';

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

describe('archiveScope', () => {
  // ADR-0033: a student's account is archived and restored with its card. In
  // the "Ustozlar / Xodimlar" tab it would be mislabelled, and restoring it
  // there alone would bring back an open account with no card.
  it('keeps student-only accounts out of the users tab', () => {
    expect(archiveScope(ArchiveEntityType.USERS, 1001)).toEqual({
      companyId: 1001,
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });

  it('adds nothing but the company to other company-scoped types', () => {
    expect(archiveScope(ArchiveEntityType.STUDENTS, 1001)).toEqual({
      companyId: 1001,
    });
  });

  it('stays empty for company-global types', () => {
    expect(archiveScope(ArchiveEntityType.LEADS, 1001)).toEqual({});
  });
});
