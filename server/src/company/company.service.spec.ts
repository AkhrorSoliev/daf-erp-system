import { BadRequestException } from '@nestjs/common';
import { CompanyService } from './company.service';

describe('CompanyService.update — DaF normasi tekshiruvi', () => {
  const mavjud = { id: 1001, dafHaftalikKun: 4, dafSariqKun: 2 };
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue(mavjud),
      update: jest.fn().mockResolvedValue(mavjud),
    },
  };
  const service = new CompanyService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("sariq chegarasi haftalikka teng bo'lsa — 400", async () => {
    await expect(
      service.update(1001, { dafSariqKun: 4 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('haftalik norma sariqqa tushib qolsa ham — 400 (mavjud sariq 2, yangi haftalik 2)', async () => {
    await expect(
      service.update(1001, { dafHaftalikKun: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ikkalasi birga to'g'ri kelsa saqlanadi", async () => {
    await service.update(1001, { dafHaftalikKun: 5, dafSariqKun: 3 });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 1001 },
      data: { dafHaftalikKun: 5, dafSariqKun: 3 },
    });
  });

  it("normaga tegmaydigan o'zgarish ham tekshiruvdan o'tadi — mavjud sariq/haftalik to'g'ri bo'lgani uchun", async () => {
    await service.update(1001, { name: 'Sprachzentrum' });
    expect(prisma.company.update).toHaveBeenCalled();
  });
});
