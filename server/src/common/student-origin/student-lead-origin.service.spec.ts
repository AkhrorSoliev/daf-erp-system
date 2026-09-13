import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { StudentLeadOriginService } from './student-lead-origin.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * O'quvchi lidsiz tug'ilmasligi kerak. Prodda 936 o'quvchidan atigi 44 tasi
 * lidga bog'langan edi, chunki /students eshigi lid yozuvini qoldirmasdi.
 */
describe('StudentLeadOriginService', () => {
  let service: StudentLeadOriginService;
  let prisma: any;
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
      leadSource: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'src-yangi' }),
      },
    };

    prisma = {
      leadSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'src-instagram' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentLeadOriginService,
        { provide: PrismaService, useValue: prisma },
      ],
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

  it("tirik lidlarni bosqichi bo'yicha qidiradi", async () => {
    await service.recordDirectOrigin(tx, baseParams);

    const call = tx.lead.findMany.mock.calls[0][0];
    expect(call.select).toEqual({ id: true });
    expect(call.where).toMatchObject({
      phone: '901234567',
      companyId: COMPANY,
    });
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        {
          deletedAt: null,
          statusEnum: {
            in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.TRIAL],
          },
        },
      ]),
    );
  });

  // RULING B — arxivdagi LOST lid ham topilishi shart. Ilgari `deletedAt: null`
  // sharti bilan LOST kesishmasi bo'sh edi: `remove()` LOST bosqichini har doim
  // `deletedAt` bilan birga yozadi, ya'ni "qaytib kelgan odam eski kartochkasiga
  // ulanadi" degan va'da hech qachon bajarilmasdi.
  it('arxivdagi LOST lidni ham qidiradi, boshqa arxiv bosqichlarini emas', async () => {
    await service.recordDirectOrigin(tx, baseParams);

    const where = tx.lead.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { deletedAt: { not: null }, statusEnum: LeadStatus.LOST },
      ]),
    );
    // Arxivdan boshqa hech qanday bosqich kirmaydi.
    expect(where.OR).toHaveLength(2);
  });

  it('LOST lid aylantirilganda arxivdan qaytariladi', async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-lost' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.updateMany.mock.calls[0][0].data).toMatchObject({
      deletedAt: null,
      deletedById: null,
      deletionBatchId: null,
      lostReason: null,
    });
  });

  // RULING A — konversiya odam haqiqatda o'qiy boshlagan filialda sanaladi.
  it("mos lidning filialini o'quvchining filialiga tenglaydi", async () => {
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

    await service.recordDirectOrigin(tx, baseParams);

    expect(tx.lead.updateMany.mock.calls[0][0].data).toMatchObject({
      branchId: 7,
    });
  });

  // F9 — ikkala aylantirish yo'li (bu yerdagi va `LeadsService.convert`) bir xil
  // shakl yozadi.
  it("ikkala yo'l ham statusChangeReason ni tozalaydi", async () => {
    await service.recordDirectOrigin(tx, baseParams);
    expect(tx.lead.create.mock.calls[0][0].data).toMatchObject({
      statusChangeReason: null,
    });

    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
    await service.recordDirectOrigin(tx, baseParams);
    expect(tx.lead.updateMany.mock.calls[0][0].data).toMatchObject({
      statusChangeReason: null,
    });
  });

  // F1 — `sourceId` to'g'ridan `Lead.sourceId` tashqi kalitiga yoziladi, ya'ni
  // yolg'on id tranzaksiya ICHIDA Prisma P2003 beradi va admin o'quvchisiz
  // qoladi. Tekshiruv tranzaksiyadan oldin bo'lishi shart.
  describe('assertSourceUsable', () => {
    it('manba topilmasa xato beradi', async () => {
      prisma.leadSource.findFirst.mockResolvedValue(null);

      await expect(
        service.assertSourceUsable("yo'q-manba", COMPANY),
      ).rejects.toThrow(NotFoundException);
    });

    it('manbani shu kompaniya ichida va tirik holda qidiradi', async () => {
      await service.assertSourceUsable('src-instagram', COMPANY);

      expect(prisma.leadSource.findFirst).toHaveBeenCalledWith({
        where: { id: 'src-instagram', deletedAt: null, companyId: COMPANY },
        select: { id: true },
      });
    });
  });

  describe('resolveSelfSignupSourceId', () => {
    it('mavjud manbani qaytaradi va yangisini yaratmaydi', async () => {
      tx.leadSource.findFirst.mockResolvedValue({ id: 'src-bot' });

      const id = await service.resolveSelfSignupSourceId(
        tx,
        'Telegram bot',
        COMPANY,
      );

      expect(id).toBe('src-bot');
      expect(tx.leadSource.create).not.toHaveBeenCalled();
      expect(tx.leadSource.findFirst).toHaveBeenCalledWith({
        where: { name: 'Telegram bot', deletedAt: null, companyId: COMPANY },
        select: { id: true },
      });
    });

    it('topilmasa yaratadi — bot uchun manbani hech kim tanlamaydi', async () => {
      const id = await service.resolveSelfSignupSourceId(
        tx,
        'Telegram bot',
        COMPANY,
      );

      expect(id).toBe('src-yangi');
      expect(tx.leadSource.create).toHaveBeenCalledWith({
        data: { name: 'Telegram bot', companyId: COMPANY },
        select: { id: true },
      });
    });

    // Poyga uchun "qayta qidirish" yo'q, ataylab: `LeadSource.name` da unikal
    // cheklov yo'q, ya'ni poyga xato bermaydi — ikkovi ham yaratadi. Xato esa
    // Postgres interaktiv tranzaksiyasini "aborted" qiladi, shuning uchun
    // o'sha `tx` bilan qayta qidirish baribir yiqilardi. Asl xato o'z nomi
    // bilan chiqishi kerak.
    it("yaratish xatosini yashirmaydi — asl xato o'z nomi bilan chiqadi", async () => {
      tx.leadSource.create.mockRejectedValue(new Error('ulanish uzildi'));

      await expect(
        service.resolveSelfSignupSourceId(tx, 'Telegram bot', COMPANY),
      ).rejects.toThrow('ulanish uzildi');
      expect(tx.leadSource.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // Natija to'ldirish skripti uchun hal qiluvchi: u faqat O'ZI YARATGAN lidning
  // sanasini o'zgartirishi kerak. Telefon bo'yicha ulangan eski kartochka
  // haftalar oldin ochilgan haqiqiy lid — uning sanasi saqlanishi shart.
  describe('natija (OriginOutcome)', () => {
    it("yangi lid yaratilganda 'created' va uning id sini qaytaradi", async () => {
      tx.lead.create.mockResolvedValue({ id: 'lead-yangi' });

      await expect(service.recordDirectOrigin(tx, baseParams)).resolves.toEqual(
        { kind: 'created', leadId: 'lead-yangi' },
      );
    });

    it("mavjud lidga ulanganda 'matched' va ulangan id larni qaytaradi", async () => {
      tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }]);

      await expect(service.recordDirectOrigin(tx, baseParams)).resolves.toEqual(
        { kind: 'matched', leadIds: ['lead-1', 'lead-2'] },
      );
    });
  });

  describe('recordSelfSignupOrigin', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sourceId: _unused, ...selfParams } = baseParams;

    it("yangi lid yaratganda manbani nomi bo'yicha hal qiladi", async () => {
      tx.leadSource.findFirst.mockResolvedValue({ id: 'src-bot' });

      await service.recordSelfSignupOrigin(tx, selfParams, 'Telegram bot');

      expect(tx.lead.create.mock.calls[0][0].data).toMatchObject({
        sourceId: 'src-bot',
        sectionId: null,
        convertedStudentId: 555,
      });
    });

    // Eski kartochka o'z manbasini saqlaydi, shuning uchun manba umuman kerak
    // emas — oldindan yaratish ro'yxatda hech qaysi lid ko'rsatmaydigan bo'sh
    // qator qoldirardi.
    it('mavjud lidga ulanganda manbani na qidiradi, na yaratadi', async () => {
      tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

      await service.recordSelfSignupOrigin(tx, selfParams, 'Telegram bot');

      expect(tx.leadSource.findFirst).not.toHaveBeenCalled();
      expect(tx.leadSource.create).not.toHaveBeenCalled();
    });
  });

  describe('findMatchingLeadIds', () => {
    it("faqat o'qiydi va id lar ro'yxatini qaytaradi", async () => {
      tx.lead.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(
        service.findMatchingLeadIds(tx, '901234567', COMPANY),
      ).resolves.toEqual(['a', 'b']);
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
      expect(tx.lead.create).not.toHaveBeenCalled();
    });
  });
});
