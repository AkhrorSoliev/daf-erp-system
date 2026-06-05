import { getSystemStartDate, floorStart } from './system-start-date';

describe('floorStart', () => {
  const floor = new Date('2026-05-01T00:00:00.000Z');

  it('returns the requested date when no floor is set', () => {
    const req = new Date('2026-04-10T00:00:00.000Z');
    expect(floorStart(req, null)).toBe(req);
  });

  it('returns undefined when neither requested nor floor is set', () => {
    expect(floorStart(undefined, null)).toBeUndefined();
    expect(floorStart(null, null)).toBeUndefined();
  });

  it('returns the floor when no requested date is given', () => {
    expect(floorStart(undefined, floor)).toBe(floor);
  });

  it('clamps a requested date earlier than the floor up to the floor', () => {
    const req = new Date('2026-04-20T00:00:00.000Z');
    expect(floorStart(req, floor)).toBe(floor);
  });

  it('keeps a requested date on/after the floor unchanged', () => {
    const after = new Date('2026-05-15T00:00:00.000Z');
    expect(floorStart(after, floor)).toBe(after);
    // exactly equal is not "before" -> unchanged
    const equal = new Date('2026-05-01T00:00:00.000Z');
    expect(floorStart(equal, floor)).toBe(equal);
  });
});

describe('getSystemStartDate', () => {
  it('returns the company systemStartDate when set', async () => {
    const date = new Date('2026-05-01T00:00:00.000Z');
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ systemStartDate: date }) },
    } as any;
    await expect(getSystemStartDate(prisma, 1001)).resolves.toBe(date);
    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 1001 },
      select: { systemStartDate: true },
    });
  });

  it('returns null when the company has no floor', async () => {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }) },
    } as any;
    await expect(getSystemStartDate(prisma, 1001)).resolves.toBeNull();
  });

  it('returns null when the company is not found', async () => {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    await expect(getSystemStartDate(prisma, 999)).resolves.toBeNull();
  });
});
