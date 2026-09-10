import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bo'limsiz lid — bu doskadagi kartochka emas, kelib chiqish yozuvi.
 *
 * `sectionId` ataylab `null`: bu lid darhol CONVERTED bo'ladi va `getBoard`
 * CONVERTED ni yashiradi, ya'ni u doskada bir soniya ham turmaydi. Unga bo'lim
 * tanlash faqat adminning haqiqiy guruh jadvalini ("A1 SPSH 15:00 Munisa")
 * ifloslantirgan bo'lardi. Filial bo'limdan emas, o'quvchidan olinadi — lidning
 * o'z `branchId` maydoni bor.
 */
const LIVE_MATCHABLE_STAGES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.TRIAL,
];

export interface DirectOriginParams {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
  companyId: number;
  sourceId: string;
  userId?: number;
}

@Injectable()
export class StudentLeadOriginService {
  constructor(private prisma: PrismaService) {}

  /**
   * `sourceId` `Lead.sourceId` tashqi kalitiga to'g'ridan yoziladi. Mavjud
   * bo'lmagan id tranzaksiya ICHIDA Prisma P2003 beradi, repoda esa global
   * Prisma xato filtri yo'q — admin tushunarsiz 500 oladi va o'quvchi ham
   * yaratilmaydi. Shuning uchun manba tranzaksiyadan OLDIN, toza xato bilan
   * tekshiriladi. `companyId` sharti majburiy: `LeadSourcesService.findAll`
   * kompaniya bo'yicha filtrlamaydi, ya'ni begona kompaniyaning manbasi shu
   * kompaniyaning lidiga tushib, manba statistikasini buzishi mumkin edi.
   * Tekshiruv `LeadsService.create` dagi bilan bir xil shaklda.
   */
  async assertSourceUsable(sourceId: string, companyId: number): Promise<void> {
    const source = await this.prisma.leadSource.findFirst({
      where: { id: sourceId, deletedAt: null, companyId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException('Lid manbasi topilmadi');
    }
  }

  /**
   * `LeadsService` ni import QILMAYDI: `LeadsModule` allaqachon `StudentsModule`
   * ni import qiladi, teskari import halqa yasaydi. Bu yerda doska mantig'i
   * kerak emas, shuning uchun `prisma.lead` ga to'g'ridan yoziladi.
   *
   * `tx` — o'quvchi yaratilayotgan tranzaksiya. Lid yozilmasa o'quvchi ham
   * yozilmaydi; hodisa (event) mexanizmi bu kafolatni bera olmaydi.
   */
  async recordDirectOrigin(
    tx: Prisma.TransactionClient,
    params: DirectOriginParams,
  ): Promise<void> {
    const now = new Date();

    const matched = await tx.lead.findMany({
      where: {
        phone: params.phone,
        companyId: params.companyId,
        OR: [
          // Doskadagi tirik lid.
          { deletedAt: null, statusEnum: { in: LIVE_MATCHABLE_STAGES } },
          // Arxivdagi YO'QOTILGAN lid. `remove()` LOST bosqichini har doim
          // `deletedAt` bilan birga yozadi, ya'ni faqat `deletedAt: null`
          // qidirilsa LOST kesishmasi bo'sh bo'lib qolardi — "qaytib kelgan
          // odam eski kartochkasiga ulanadi" degan va'da bajarilmasdi.
          // Arxivning boshqa hech qanday bosqichi bu yerga kirmaydi: o'chirilgan
          // lid o'chirilganicha qoladi.
          { deletedAt: { not: null }, statusEnum: LeadStatus.LOST },
        ],
      },
      select: { id: true },
    });

    const conversionFields = {
      statusEnum: LeadStatus.CONVERTED,
      status: 'converted',
      convertedStudentId: params.studentId,
      statusChangedAt: now,
      statusChangedById: params.userId ?? null,
      // `LeadsService.convert` ham shu maydonni tozalaydi — ikkala aylantirish
      // yo'li bitta shakl yozadi.
      statusChangeReason: null,
    };

    if (matched.length > 0) {
      // Mavjud lid o'z bo'limida va o'z manbasi bilan qoladi — uning kelib
      // chiqishi haqiqat, admin endi tanlagan manba emas. Filial esa AKSINCHA:
      // konversiya odam haqiqatda o'qiy boshlagan filialda sanaladi, shuning
      // uchun lidning filiali o'quvchinikiga tenglashtiriladi. Bu ikkita holni
      // yopadi: ochiq formadan kelgan filialsiz lid hech qaysi filialda
      // sanalmasdi, va Farg'ona admini Namangan lidini aylantirsa konversiya
      // noto'g'ri filialga yozilardi.
      //
      // Arxivdan qaytarish maydonlari bilan birga: aylantirilgan LOST lid
      // endi arxiv qatori emas, haqiqiy konversiya.
      await tx.lead.updateMany({
        where: { id: { in: matched.map((l) => l.id) } },
        data: {
          ...conversionFields,
          branchId: params.branchId,
          deletedAt: null,
          deletedById: null,
          deletionBatchId: null,
          lostReason: null,
        },
      });
      return;
    }

    await tx.lead.create({
      data: {
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        companyId: params.companyId,
        branchId: params.branchId,
        sectionId: null,
        sourceId: params.sourceId,
        ...conversionFields,
      },
    });
  }
}
