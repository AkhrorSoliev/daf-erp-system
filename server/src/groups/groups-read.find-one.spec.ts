import { NotFoundException } from '@nestjs/common';
import { GroupsReadService } from './groups-read.service';

/**
 * `GET /groups/:id` filters by the branch the switcher is on. A group of
 * another branch the caller works in therefore came back "Guruh topilmadi",
 * and the page added «bo'yicha guruh mavjud emas». On 01.10.2026 a CEO in
 * Farg'ona opened eight Namangan lessons from /tasks, read that the groups
 * did not exist and cancelled them — 1 667 518 so'm went back to 58 students.
 * The 404 now names the branch, so the page can offer to switch to it.
 */
describe('GroupsReadService.findOne — a group of another branch', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;
  let prisma: { group: { findFirst: jest.Mock } };
  let service: GroupsReadService;

  beforeEach(() => {
    prisma = { group: { findFirst: jest.fn() } };
    service = new GroupsReadService(prisma as never, {} as never);
  });

  it('names the branch the group belongs to when the caller may open it', async () => {
    prisma.group.findFirst
      .mockResolvedValueOnce(null) // not in the selected branch
      .mockResolvedValueOnce({
        branch: { id: NAMANGAN, name: 'Namangan filiali' },
      });

    const err = await service
      .findOne('g-nam', 1001, [FARGONA], [FARGONA, NAMANGAN])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getResponse()).toEqual(
      expect.objectContaining({
        message:
          "Bu guruh «Namangan filiali» filialiga tegishli. Ko'rish uchun shu filialni tanlang.",
        branch: { id: NAMANGAN, name: 'Namangan filiali' },
      }),
    );
    // The second look is bounded by the caller's own branches.
    expect(prisma.group.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: 'g-nam',
        deletedAt: null,
        companyId: 1001,
        branchId: { in: [FARGONA, NAMANGAN] },
      },
      select: { branch: { select: { id: true, name: true } } },
    });
  });

  it('stays a plain 404 for a group outside the caller’s branches', async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    const err = await service
      .findOne('g-nam', 1001, [FARGONA], [FARGONA])
      .catch((e: unknown) => e);

    expect((err as NotFoundException).getResponse()).toEqual(
      expect.objectContaining({ message: 'Guruh #g-nam topilmadi' }),
    );
    // Same scope twice is not asked twice.
    expect(prisma.group.findFirst).toHaveBeenCalledTimes(1);
  });

  it('stays a plain 404 when every branch was already searched', async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    await expect(service.findOne('g-x', 1001, null, null)).rejects.toThrow(
      'Guruh #g-x topilmadi',
    );
    expect(prisma.group.findFirst).toHaveBeenCalledTimes(1);
  });
});
