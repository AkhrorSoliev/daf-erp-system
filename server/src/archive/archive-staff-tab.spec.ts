import { NotFoundException } from '@nestjs/common';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveDeleteService } from './archive-delete.service';
import { ArchiveEntityType } from './dto/archive-query.dto';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

/** Every door of the users tab applies the same scope (ADR-0033). */
describe('archive users tab — student accounts belong to their card', () => {
  const count = () => jest.fn().mockResolvedValue(0);
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        count: count(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      branch: { count: count() },
      room: { count: count() },
      course: { count: count() },
      student: { count: count() },
      lead: { count: count() },
      leadSection: { count: count() },
      group: { count: count() },
      enrollment: { count: count() },
      holiday: { count: count() },
    };
  });

  it('counts, lists and opens users without student-only accounts', async () => {
    const read = new ArchiveReadService(prisma);

    await read.getCounts(1001);
    expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    await read.findAll(
      ArchiveEntityType.USERS,
      { page: 1, pageSize: 10 } as any,
      1001,
    );
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    await expect(
      read.findOne(ArchiveEntityType.USERS, 30001, 1001),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });

  it('will not restore or permanently delete a student-only account on its own', async () => {
    const restore = new ArchiveRestoreService(prisma, {} as any, {} as any);
    await expect(
      restore.restore(ArchiveEntityType.USERS, 30001, 7, 1001),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    prisma.user.findFirst.mockClear();
    const remove = new ArchiveDeleteService(prisma, {} as any);
    await expect(
      remove.permanentDelete(ArchiveEntityType.USERS, 30001, 1001),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });
});
