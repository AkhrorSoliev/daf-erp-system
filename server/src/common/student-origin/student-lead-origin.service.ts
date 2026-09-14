import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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

/**
 * Odam o'zi ro'yxatdan o'tadigan yo'llarning manbasi.
 *
 * `/students` eshigida manbani admin tanlaydi, bu ikkovida esa tanlaydigan
 * odam yo'q — lekin "qayerdan keldi" savoliga javob baribir bor: u botdan
 * kelgan yoki mock imtihondan. Shuning uchun manba `null` qoldirilmaydi,
 * shu nomlar bilan yoziladi. Admin keyin ularni oddiy manba ro'yxatida
 * qayta nomlashi mumkin — bu nomlar faqat BIRINCHI yaratishda ishlatiladi,
 * qidiruv esa id bo'yicha ketadi.
 */
export const SELF_SIGNUP_SOURCE = {
  TELEGRAM_BOT: 'Telegram bot',
  MOCK_EXAM: 'Mock imtihon',
} as const;

/**
 * Tizim manbasi nomimi (katta-kichik harfsiz). Forma havolasi tegi bu nomlarni
 * ololmaydi: aks holda formadan kelgan lid «botdan o'zi ro'yxatdan o'tgan»
 * bilan aralashardi. Klientdagi nusxasi: client/src/lib/reserved-lead-sources.ts
 */
export function isSelfSignupSourceName(name: string): boolean {
  const key = name.trim().toLowerCase();
  return Object.values(SELF_SIGNUP_SOURCE).some((n) => n.toLowerCase() === key);
}

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

/** O'zi ro'yxatdan o'tadigan yo'l uchun: manbani chaqiruvchi emas, xizmat hal qiladi. */
export type SelfSignupOriginParams = Omit<DirectOriginParams, 'sourceId'>;

/**
 * Nima qilingani. Chaqiruvchilarning ko'pi e'tibor bermaydi, lekin to'ldirish
 * skripti uchun bu hal qiluvchi: u faqat O'ZI YARATGAN lidning sanasini
 * o'quvchiniki bilan tenglashtirishi kerak. Telefon bo'yicha ulangan eski
 * kartochka — doskada haftalar oldin ochilgan haqiqiy lid — o'z sanasini
 * saqlashi shart, aks holda voronka odam qachon kelganini yo'qotadi.
 */
export type OriginOutcome =
  | { kind: 'created'; leadId: string }
  | { kind: 'matched'; leadIds: string[] };

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
   * Nomi bo'yicha manbani topadi, bo'lmasa yaratadi — o'zi ro'yxatdan
   * o'tadigan yo'llar uchun (Telegram boti, mock imtihon), ularda manbani
   * tanlaydigan admin yo'q.
   *
   * POYGA HAQIDA HALOL: `LeadSource.name` da unikal cheklov yo'q, shuning
   * uchun ikkita ro'yxat bir vaqtda kelsa ikkovi ham topa olmay, ikkovi ham
   * MUVAFFAQIYATLI yaratadi — xato bo'lmaydi. Natija ikkita bir xil nomli
   * manba. Bu ma'lumotni buzmaydi (lidlar ikkala id ga bo'linadi, admin
   * birini o'chirib ikkinchisiga birlashtiradi), va buni to'liq yopish unikal
   * cheklov, ya'ni migratsiya talab qiladi.
   *
   * Xato ushlanmaydi: Postgres interaktiv tranzaksiyada yiqilgan so'rovdan
   * keyin butun tranzaksiyani "aborted" holatiga o'tkazadi, ya'ni o'sha `tx`
   * orqali qayta qidirish baribir yiqiladi. Ushlash faqat asl xatoning
   * nomini yashirardi — ulanish yoki tashqi kalit xatosi noto'g'ri xabar
   * ostida chiqib, keyingi tuzatuvchini adashtirardi.
   */
  async resolveSelfSignupSourceId(
    tx: Prisma.TransactionClient,
    name: string,
    companyId: number,
  ): Promise<string> {
    const existing = await tx.leadSource.findFirst({
      where: { name, deletedAt: null, companyId },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.leadSource.create({
      data: { name, companyId },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Telefon bo'yicha ulanadigan lidlar. Faqat o'qiydi — to'ldirish skriptining
   * quruq ishga tushirishi ham shu predikatdan foydalanadi, shunda "kim ulanadi,
   * kim yaratiladi" ko'rsatuvi haqiqiy yozuv bilan hech qachon farq qilmaydi.
   */
  async findMatchingLeadIds(
    db: Prisma.TransactionClient,
    phone: string,
    companyId: number,
  ): Promise<string[]> {
    const matched = await db.lead.findMany({
      where: {
        phone,
        companyId,
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
    return matched.map((l) => l.id);
  }

  /**
   * `/students` eshigi uchun — manbani admin tanlagan.
   *
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
  ): Promise<OriginOutcome> {
    return this.applyOrigin(tx, params, () => Promise.resolve(params.sourceId));
  }

  /**
   * O'zi ro'yxatdan o'tadigan yo'llar uchun (Telegram boti, mock imtihon).
   *
   * Manba faqat YANGI lid yaratilganda hal qilinadi. Telefon eski kartochkaga
   * ulansa, u kartochka o'z manbasini saqlaydi — oldindan manba yaratish esa
   * hech qaysi lid ko'rsatmaydigan bo'sh qatorni ro'yxatda qoldirardi.
   */
  async recordSelfSignupOrigin(
    tx: Prisma.TransactionClient,
    params: SelfSignupOriginParams,
    sourceName: string,
  ): Promise<OriginOutcome> {
    return this.applyOrigin(tx, params, () =>
      this.resolveSelfSignupSourceId(tx, sourceName, params.companyId),
    );
  }

  private async applyOrigin(
    tx: Prisma.TransactionClient,
    params: SelfSignupOriginParams,
    resolveSourceId: () => Promise<string>,
  ): Promise<OriginOutcome> {
    const now = new Date();
    const matchedIds = await this.findMatchingLeadIds(
      tx,
      params.phone,
      params.companyId,
    );

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

    if (matchedIds.length > 0) {
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
        where: { id: { in: matchedIds } },
        data: {
          ...conversionFields,
          branchId: params.branchId,
          deletedAt: null,
          deletedById: null,
          deletionBatchId: null,
          lostReason: null,
        },
      });
      return { kind: 'matched', leadIds: matchedIds };
    }

    const created = await tx.lead.create({
      data: {
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        companyId: params.companyId,
        branchId: params.branchId,
        sectionId: null,
        sourceId: await resolveSourceId(),
        ...conversionFields,
      },
      select: { id: true },
    });
    return { kind: 'created', leadId: created.id };
  }
}
