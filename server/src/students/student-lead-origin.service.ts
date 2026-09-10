import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';

/**
 * Bo'limsiz lid — bu doskadagi kartochka emas, kelib chiqish yozuvi.
 *
 * `sectionId` ataylab `null`: bu lid darhol CONVERTED bo'ladi va `getBoard`
 * CONVERTED ni yashiradi, ya'ni u doskada bir soniya ham turmaydi. Unga bo'lim
 * tanlash faqat adminning haqiqiy guruh jadvalini ("A1 SPSH 15:00 Munisa")
 * ifloslantirgan bo'lardi. Filial bo'limdan emas, o'quvchidan olinadi — lidning
 * o'z `branchId` maydoni bor.
 */
const MATCHABLE_STAGES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.TRIAL,
  // LOST ham qidiriladi: yo'qotilgan deb belgilangan odam qaytib kelib
  // ro'yxatdan o'tsa, u eski kartochkasi bilan bog'lanishi kerak.
  LeadStatus.LOST,
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
        deletedAt: null,
        companyId: params.companyId,
        statusEnum: { in: MATCHABLE_STAGES },
      },
      select: { id: true },
    });

    if (matched.length > 0) {
      // Mavjud lid o'z bo'limida va o'z manbasi bilan qoladi — uning kelib
      // chiqishi haqiqat, admin endi tanlagan manba emas.
      await tx.lead.updateMany({
        where: { id: { in: matched.map((l) => l.id) } },
        data: {
          statusEnum: LeadStatus.CONVERTED,
          status: 'converted',
          convertedStudentId: params.studentId,
          statusChangedAt: now,
          statusChangedById: params.userId ?? null,
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
        statusEnum: LeadStatus.CONVERTED,
        status: 'converted',
        convertedStudentId: params.studentId,
        statusChangedAt: now,
        statusChangedById: params.userId ?? null,
      },
    });
  }
}
