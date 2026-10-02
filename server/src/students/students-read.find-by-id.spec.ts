import { NotFoundException } from '@nestjs/common';
import { StudentsReadService } from './students-read.service';

/**
 * `GET /students/:id` filters by the branch the switcher is on, so a student
 * of another branch the caller works in came back «O'quvchi topilmadi … mavjud
 * emas» — the same answer that made a CEO cancel eight Namangan lessons on
 * 01.10.2026 (ADR-0063). The 404 now names the branch.
 */
describe('StudentsReadService.findById — a student of another branch', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;
  let prisma: {
    student: { findFirst: jest.Mock };
    transaction: { findFirst: jest.Mock };
  };
  let service: StudentsReadService;

  beforeEach(() => {
    prisma = {
      student: { findFirst: jest.fn() },
      transaction: { findFirst: jest.fn() },
    };
    service = new StudentsReadService(
      prisma as never,
      {} as never,
      {} as never,
    );
  });

  it('names the branch the student belongs to when the caller may open it', async () => {
    prisma.student.findFirst
      .mockResolvedValueOnce(null) // not in the selected branch
      .mockResolvedValueOnce({
        branches: [{ branch: { id: NAMANGAN, name: 'Namangan filiali' } }],
      });

    const err: unknown = await service
      .findById(11006, 1001, [FARGONA], [FARGONA, NAMANGAN])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getResponse()).toEqual(
      expect.objectContaining({
        message:
          "Bu o'quvchi «Namangan filiali» filialiga tegishli. Ko'rish uchun shu filialni tanlang.",
        branch: { id: NAMANGAN, name: 'Namangan filiali' },
      }),
    );
    // The second look and the branch it names stay inside the caller's
    // own branches.
    expect(prisma.student.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: 11006,
        companyId: 1001,
        branches: { some: { branchId: { in: [FARGONA, NAMANGAN] } } },
      },
      select: {
        branches: {
          where: { branchId: { in: [FARGONA, NAMANGAN] } },
          select: { branch: { select: { id: true, name: true } } },
          orderBy: { branchId: 'asc' },
          take: 1,
        },
      },
    });
  });

  it('stays a plain 404 for a student outside the caller’s branches', async () => {
    prisma.student.findFirst.mockResolvedValue(null);

    const err: unknown = await service
      .findById(11006, 1001, [FARGONA], [FARGONA])
      .catch((e: unknown) => e);

    expect((err as NotFoundException).getResponse()).toEqual(
      expect.objectContaining({ message: "O'quvchi topilmadi" }),
    );
    expect(prisma.student.findFirst).toHaveBeenCalledTimes(1);
  });

  it('stays a plain 404 when every branch was already searched', async () => {
    prisma.student.findFirst.mockResolvedValue(null);

    await expect(service.findById(11006, 1001, null, null)).rejects.toThrow(
      "O'quvchi topilmadi",
    );
    expect(prisma.student.findFirst).toHaveBeenCalledTimes(1);
  });
});
