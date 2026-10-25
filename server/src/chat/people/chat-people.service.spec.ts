import { BadRequestException } from '@nestjs/common';
import { activeStudentWhere } from '../../students/shared/active-student-where';
import { ChatPeopleService } from './chat-people.service';

function make(over: Record<string, unknown> = {}) {
  const prisma = {
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    chatPrivacy: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    chatBlock: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  };
  return { service: new ChatPeopleService(prisma as never), prisma };
}

const row = (id: number, extra = {}) => ({
  id,
  firstName: `A${id}`,
  lastName: `B${id}`,
  username: null,
  photo: `p${id}`,
  ...extra,
});

describe('ChatPeopleService.search', () => {
  it('hides students who switched name search off and those who blocked the viewer', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2), row(3), row(4)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 3, whoCanFind: 'NOBODY', whoSeesPhoto: 'EVERYONE' },
    ]);
    prisma.chatBlock.findMany.mockResolvedValue([
      { blockerId: 4, blockedId: 1 },
    ]);
    const out = await service.search(1, 1, 'ab');
    expect(out.map((p) => p.id)).toEqual([2]);
  });

  it('never returns the viewer', async () => {
    const { service, prisma } = make();
    await service.search(1, 1, 'ab');
    expect(prisma.student.findMany.mock.calls[0][0].where.id).toEqual({
      not: 1,
    });
  });

  it('searches by exact username when the query starts with @', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(
      row(9, { username: 'asror_01' }),
    );
    const out = await service.search(1, 1, '@Asror_01');
    expect(prisma.student.findFirst.mock.calls[0][0].where.username).toBe(
      'asror_01',
    );
    expect(out.map((p) => p.id)).toEqual([9]);
  });

  it('hides the photo from a non-group-mate when the owner limited it', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 2, whoCanFind: 'EVERYONE', whoSeesPhoto: 'GROUPMATES' },
    ]);
    const out = await service.search(1, 1, 'ab');
    expect(out[0].photo).toBeNull();
  });

  it('name search is scoped to studying (activeStudentWhere) live students of the company, not the viewer', async () => {
    const { service, prisma } = make();
    await service.search(1, 7, 'ab');
    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(7);
    expect(where.deletedAt).toBeNull();
    expect(where).toMatchObject(activeStudentWhere());
    expect(where.status).toBe('ACTIVE');
    expect(where.enrollments.some).toBeDefined();
    expect(where.id).toEqual({ not: 1 });
  });

  it('an exact @username is found even when the owner switched name search off', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(row(9, { username: 'x_01' }));
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 9, whoCanFind: 'NOBODY', whoSeesPhoto: 'EVERYONE' },
    ]);
    const out = await service.search(1, 1, '@x_01');
    expect(out.map((p) => p.id)).toEqual([9]);
  });

  it('the @username path drops the viewer themselves', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(row(1, { username: 'me_01' }));
    expect(await service.search(1, 1, '@me_01')).toEqual([]);
  });

  it('the @username path still returns a student who blocked the viewer', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(row(9, { username: 'x_01' }));
    prisma.chatBlock.findMany.mockResolvedValue([
      { blockerId: 9, blockedId: 1 },
    ]);
    const out = await service.search(1, 1, '@x_01');
    expect(out.map((p) => p.id)).toEqual([9]);
    expect(prisma.chatBlock.findMany).not.toHaveBeenCalled();
  });

  it('the name path hides a student who blocked the viewer', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(9), row(8)]);
    prisma.chatBlock.findMany.mockResolvedValue([
      { blockerId: 9, blockedId: 1 },
    ]);
    const out = await service.search(1, 1, 'ab');
    expect(out.map((p) => p.id)).toEqual([8]);
    expect(prisma.chatBlock.findMany.mock.calls[0][0].where).toEqual({
      blockerId: { in: [9, 8] },
      blockedId: 1,
    });
  });

  it('keeps the photo of a group-mate when the owner limited it to group-mates', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 2, whoCanFind: 'EVERYONE', whoSeesPhoto: 'GROUPMATES' },
    ]);
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'e' });
    const out = await service.search(1, 1, 'ab');
    expect(out[0].photo).toBe('p2');
  });

  it('hides the photo when the owner chose NOBODY, even for a group-mate', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 2, whoCanFind: 'EVERYONE', whoSeesPhoto: 'NOBODY' },
    ]);
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'e' });
    const out = await service.search(1, 1, 'ab');
    expect(out[0].photo).toBeNull();
  });
});

describe('ChatPeopleService.updatePrivacy', () => {
  it('writes only the sent key', async () => {
    const { service, prisma } = make();
    prisma.chatPrivacy.upsert.mockResolvedValue({
      whoCanWrite: 'NOBODY',
      whoCanFind: 'EVERYONE',
      whoSeesPhoto: 'EVERYONE',
    });
    await service.updatePrivacy(5, { whoCanWrite: 'NOBODY' } as never);
    expect(prisma.chatPrivacy.upsert).toHaveBeenCalledWith({
      where: { studentId: 5 },
      create: { studentId: 5, whoCanWrite: 'NOBODY' },
      update: { whoCanWrite: 'NOBODY' },
    });
  });
});

describe('ChatPeopleService.peerSummary', () => {
  it('throws when the peer row is missing', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(null);
    const err = await service.peerSummary(1, 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe("O'quvchi topilmadi");
  });
});

describe('ChatPeopleService.block', () => {
  it('refuses blocking yourself', async () => {
    const { service } = make();
    await expect(service.block(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('is idempotent', async () => {
    const { service, prisma } = make();
    await service.block(1, 2);
    expect(prisma.chatBlock.upsert).toHaveBeenCalledWith({
      where: { blockerId_blockedId: { blockerId: 1, blockedId: 2 } },
      create: { blockerId: 1, blockedId: 2 },
      update: {},
    });
  });
});

describe('ChatPeopleService.getMine', () => {
  it('returns the ids of the students I blocked', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue({ username: 'ali' });
    prisma.chatBlock.findMany.mockResolvedValue([
      { blockedId: 7 },
      { blockedId: 9 },
    ]);
    const out = await service.getMine(1, 1);
    expect(out.blockedIds).toEqual([7, 9]);
    expect(prisma.chatBlock.findMany.mock.calls[0][0].where).toEqual({
      blockerId: 1,
    });
  });

  it('returns an empty list when I blocked nobody', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue({ username: null });
    const out = await service.getMine(1, 1);
    expect(out.blockedIds).toEqual([]);
  });
});

describe('ChatPeopleService.sharesGroup', () => {
  it('asks for a live ACTIVE enrollment in the same live group', async () => {
    const { service, prisma } = make();
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'e' });
    expect(await service.sharesGroup(1, 2)).toBe(true);
    const where = prisma.enrollment.findFirst.mock.calls[0][0].where;
    expect(where.studentId).toBe(1);
    expect(where.status).toBe('ACTIVE');
    expect(where.deletedAt).toBeNull();
    expect(where.group.enrollments.some.studentId).toBe(2);
  });
});
