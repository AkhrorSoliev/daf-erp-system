import { NotFoundException } from '@nestjs/common';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveEntityType } from './dto/archive-query.dto';

describe('ArchiveReadService.findOne — batafsil include', () => {
  let prisma: any;
  let read: ArchiveReadService;

  beforeEach(() => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10482 }) },
      group: { findFirst: jest.fn().mockResolvedValue({ id: 'g1' }) },
      course: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    read = new ArchiveReadService(prisma);
  });

  it("o'quvchi: yozilishlar va filiallarni so'raydi, arxiv va kompaniya filtri qoladi", async () => {
    await read.findOne(ArchiveEntityType.STUDENTS, '10482', 1001);
    const arg = prisma.student.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      id: 10482,
      deletedAt: { not: null },
      companyId: 1001,
    });
    expect(arg.include.enrollments).toMatchObject({
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    expect(arg.include.branches).toBeDefined();
    expect(arg.include.deletedBy).toBeDefined();
    expect(arg.include._count).toEqual({ select: { enrollments: true } });
  });

  it("guruh: ustozlar va o'quvchilarni so'raydi", async () => {
    await read.findOne(ArchiveEntityType.GROUPS, 'g1', 1001);
    const arg = prisma.group.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'g1', deletedAt: { not: null } });
    expect(arg.include.teachers).toBeDefined();
    expect(arg.include.enrollments).toMatchObject({ take: 50 });
    expect(arg.include.course).toBeDefined();
  });

  it("boshqa tur (kurs): eski include o'zgarmaydi", async () => {
    await read.findOne(ArchiveEntityType.COURSES, 'c1', 1001);
    const arg = prisma.course.findFirst.mock.calls[0][0];
    expect(arg.include.enrollments).toBeUndefined();
    expect(arg.include.deletedBy).toBeDefined();
  });

  it('topilmasa 404', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(
      read.findOne(ArchiveEntityType.STUDENTS, '10482', 1001),
    ).rejects.toThrow(NotFoundException);
  });
});
