import { BadRequestException } from '@nestjs/common';
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
