import { BadRequestException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { fillStudentProfile } from './fill-student-profile';

const target = (o: object = {}) => ({
  id: 7,
  gender: null,
  dateOfBirth: null,
  companyId: 1,
  userId: null,
  ...o,
});

function makeDeps() {
  return {
    prisma: {
      student: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    },
    entityHistory: { recordUpdate: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('fillStudentProfile', () => {
  it('writes both empty fields and records history', async () => {
    const d = makeDeps();
    const written = await fillStudentProfile(
      d as any,
      target(),
      { gender: Gender.FEMALE, dateOfBirth: '2005-03-15' },
      99,
    );
    expect(written).toEqual({
      gender: Gender.FEMALE,
      dateOfBirth: '2005-03-15',
    });
    expect(d.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, gender: null },
      data: { gender: Gender.FEMALE },
    });
    expect(d.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, dateOfBirth: null },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    expect(d.entityHistory.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 7,
        changedById: 99,
        companyId: 1,
      }),
    );
  });

  it('never overwrites a field staff already filled', async () => {
    const d = makeDeps();
    const written = await fillStudentProfile(
      d as any,
      target({ gender: Gender.MALE, dateOfBirth: new Date('2000-01-01') }),
      { gender: Gender.FEMALE, dateOfBirth: '2005-03-15' },
    );
    expect(written).toEqual({});
    expect(d.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(d.entityHistory.recordUpdate).not.toHaveBeenCalled();
  });

  it('rejects an impossible date before writing anything', async () => {
    const d = makeDeps();
    await expect(
      fillStudentProfile(d as any, target(), {
        gender: Gender.MALE,
        dateOfBirth: '2005-02-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(d.prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('count 0 means nothing written: no mirror, no history', async () => {
    const d = makeDeps();
    d.prisma.student.updateMany.mockResolvedValue({ count: 0 });
    const written = await fillStudentProfile(d as any, target({ userId: 5 }), {
      gender: Gender.MALE,
      dateOfBirth: '2005-03-15',
    });
    expect(written).toEqual({});
    expect(d.prisma.user.update).not.toHaveBeenCalled();
    expect(d.entityHistory.recordUpdate).not.toHaveBeenCalled();
  });

  it('mirrors gender onto the linked account only', async () => {
    const d = makeDeps();
    await fillStudentProfile(d as any, target({ userId: 5 }), {
      gender: Gender.MALE,
    });
    expect(d.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { gender: Gender.MALE },
    });

    const d2 = makeDeps();
    await fillStudentProfile(d2 as any, target({ userId: null }), {
      gender: Gender.MALE,
    });
    expect(d2.prisma.user.update).not.toHaveBeenCalled();

    const d3 = makeDeps();
    await fillStudentProfile(d3 as any, target({ userId: 5 }), {
      dateOfBirth: '2005-03-15',
    });
    expect(d3.prisma.user.update).not.toHaveBeenCalled();
  });
});
