import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';
import { StudentLeadOriginService } from './student-lead-origin.service';

/**
 * O'quvchi lidsiz tug'ilmasligi kerak. Prodda 936 o'quvchidan atigi 44 tasi
 * lidga bog'langan edi, chunki /students eshigi lid yozuvini qoldirmasdi.
 */
describe('StudentLeadOriginService', () => {
  let service: StudentLeadOriginService;
  let tx: any;

  const COMPANY = 1001;
  const baseParams = {
    studentId: 555,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    branchId: 7,
    companyId: COMPANY,
    sourceId: 'src-instagram',
    userId: 42,
  };

  beforeEach(async () => {
    tx = {
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'lead-new' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentLeadOriginService],
    }).compile();

    service = module.get(StudentLeadOriginService);
  });

  it("mos lid topilmasa bo'limsiz CONVERTED lid yaratadi", async () => {
    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.create).toHaveBeenCalledTimes(1);
    const data = tx.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '901234567',
      companyId: COMPANY,
      branchId: 7,
      sectionId: null,
      sourceId: 'src-instagram',
      statusEnum: LeadStatus.CONVERTED,
      convertedStudentId: 555,
      statusChangedById: 42,
    });
    expect(data.statusChangedAt).toBeInstanceOf(Date);
  });

  it('mos lid topilsa yangisini yaratmaydi, mavjudini CONVERTED qiladi', async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.create).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lead-1'] } },
      data: expect.objectContaining({
        statusEnum: LeadStatus.CONVERTED,
        convertedStudentId: 555,
        statusChangedById: 42,
      }),
    });
  });

  it("bir xil telefonli bir nechta lidning HAMMASINI bog'laydi", async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lead-1', 'lead-2'] } },
      data: expect.any(Object),
    });
  });

  it("mavjud lidning o'z manbasini o'zgartirmaydi", async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

    await service.recordDirectOrigin(tx, baseParams);

    const data = tx.lead.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('sourceId');
  });

  it('faqat tirik va aylantirilmagan lidlarni qidiradi', async () => {
    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.findMany).toHaveBeenCalledWith({
      where: {
        phone: '901234567',
        deletedAt: null,
        companyId: COMPANY,
        statusEnum: {
          in: [
            LeadStatus.NEW,
            LeadStatus.CONTACTED,
            LeadStatus.TRIAL,
            LeadStatus.LOST,
          ],
        },
      },
      select: { id: true },
    });
  });
});
