import { NotFoundException } from '@nestjs/common';
import { StudentPortalWriteService } from './student-portal-write.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentPortalWriteService.updateLernenTema', () => {
  function build(count: number) {
    const prisma = {
      student: { updateMany: jest.fn().mockResolvedValue({ count }) },
    };
    const service = new StudentPortalWriteService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  }

  it("writes the id on the caller's own live card only", async () => {
    const { prisma, service } = build(1);
    const res = await service.updateLernenTema(10042, 'ormon');
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 10042, deletedAt: null },
      data: { lernenTema: 'ormon' },
    });
    expect(res).toEqual({ lernenTema: 'ormon' });
  });

  it('refuses an archived or missing card', async () => {
    const { service } = build(0);
    await expect(service.updateLernenTema(10042, 'ormon')).rejects.toThrow(
      NotFoundException,
    );
  });
});
