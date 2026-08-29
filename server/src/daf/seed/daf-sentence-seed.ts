import { DafSentenceOrigin } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export interface SentenceFile {
  generatedAt: string;
  model: string;
  units: {
    order: number;
    sentences: { de: string; uz: string; origin: DafSentenceOrigin }[];
  }[];
}

export function countWords(s: string): number {
  return (s.match(/[a-zA-ZäöüÄÖÜß]+/g) ?? []).length;
}

/**
 * Fayldagi kelib chiqish qiymatini bazaning enumiga tekshirib o'giradi.
 *
 * `SentenceFile.sentences[].origin` tip darajasida allaqachon
 * `DafSentenceOrigin` — lekin bu FAQAT kelishuv, tekshiruv emas: qiymat
 * `JSON.parse` dan `as SentenceFile` orqali kelgan, ya'ni kompilyator
 * ichidagi matnni hech qachon o'qimagan. Fayl qo'lda tahrirlansa yoki
 * ertaga uchinchi qiymat qo'shilsa, tekshiruvsiz kod bu yerda emas,
 * ko'rinmas joyda — Prisma'ning o'zida — yiqilardi, va o'sha xato qaysi
 * bo'lim, qaysi gap ekanini aytmaydi. Shu yerda aniq manzil bilan
 * yiqilish muammoni darhol topadi.
 */
export function toSentenceOrigin(
  value: string,
  where: string,
): DafSentenceOrigin {
  if (
    value === DafSentenceOrigin.GENERATED ||
    value === DafSentenceOrigin.SOURCE
  ) {
    return value;
  }
  throw new Error(
    `${where}: \`${value}\` kelib chiqishi bazada yo'q — migratsiya kerak`,
  );
}

/**
 * Gaplarni bazaga yozadi.
 *
 * `audioKey` ATAYLAB yangilanmaydi: u TTS o'lchovining natijasi, gap
 * matnining tahriri emas. Ikkalasini bir upsert'da yangilash keyingi
 * seed'da butun ovozni o'chirib yuborardi.
 *
 * `origin` FAYLDAN o'qiladi (qattiq `GENERATED` yozilmaydi): 510 gapning
 * 30 tasi manbadagi tayyor ibora (`SOURCE`), ularni «yasama» deb
 * belgilash kelib chiqishini yo'qotardi. `update` blokida esa `origin`ga
 * ATAYLAB tegilmaydi — u `audioKey` bilan bir qatorda turadi: bazadagi
 * qiymat qo'lda tuzatilgan bo'lishi mumkin (masalan ustoz noto'g'ri
 * tasnifni tuzatgan), va fayl qayta yuritilganda uni bosib o'tmasligi
 * kerak.
 */
export async function seedSentences(
  prisma: PrismaService,
  file: SentenceFile,
): Promise<number> {
  let n = 0;

  for (const u of file.units) {
    const unit = await prisma.dafUnit.findFirst({
      where: { level: 'A1', order: u.order },
    });
    if (!unit) throw new Error(`Bo'lim topilmadi: A1 #${u.order}`);

    for (const [i, s] of u.sentences.entries()) {
      const order = i + 1;
      const origin = toSentenceOrigin(s.origin, `A1 #${u.order} gap ${order}`);

      await prisma.dafSentence.upsert({
        where: { unitId_order: { unitId: unit.id, order } },
        create: {
          unitId: unit.id,
          order,
          de: s.de,
          uz: s.uz,
          wordCount: countWords(s.de),
          origin,
        },
        update: { de: s.de, uz: s.uz, wordCount: countWords(s.de) },
      });
      n++;
    }
  }

  return n;
}
