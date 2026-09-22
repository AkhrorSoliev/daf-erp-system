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
 * A1 uchun bu funksiya endi FAQAT nafaqaga chiqarilgan (`retiredAt` bor)
 * bo'limga tegishli bo'lishi mumkin — jonli A1 endi `InhaltSeedService`
 * ('npm run daf:inhalt-seed') ning yagona ishi, xuddi unit/dars/qoida
 * uchun `DafSeedService`da qilinganidek (`assertA1NotProvided`,
 * `level === DafLevel.A1` tekshiruvi).
 *
 * Sabab shu funksiyaga xos: u `dafUnit`ni FAQAT `level` + POZITSION
 * `order` bo'yicha izlaydi (`content/daf/sentences.json` — A1 ning ESKI
 * 20 bo'limlik tuzilishi, `order` 1..20). "A1 xaritasi migratsiyasi"dan
 * keyin eski (nafaqaga chiqqan) bo'limlarning `order`i MANFIY qilib
 * qo'yildi, YANGI 12 unit esa xuddi shu `level`, xuddi shu musbat
 * oraliqdagi (`order` 1..12) qatorlarni egalladi. Demak bugun bu qidiruv
 * `order` 1..12 uchun har doim YANGI (u01..u12) unitning o'ziga to'g'ri
 * keladi — eskisiga emas — va bu funksiyani qayta chaqirish ularning
 * gaplarini eski (yoki umuman tegishli bo'lmagan) matn bilan bosib
 * yozib qo'yardi.
 */
function assertUnitIsRetired(
  unit: { retiredAt: Date | null },
  order: number,
): void {
  if (unit.retiredAt) return;
  throw new Error(
    `A1 #${order}: bu unit JONLI (nafaqaga chiqarilmagan) — uning gaplari endi ` +
      "'InhaltSeedService' (`npm run daf:inhalt-seed`) ning yagona ishi. " +
      "'seedSentences' faqat nafaqaga chiqarilgan (retiredAt bor) eski A1 " +
      "bo'limlarining muzlagan matnini tuzatish uchun qoladi.",
  );
}

/**
 * Gaplarni bazaga yozadi.
 *
 * `origin` FAYLDAN o'qiladi (qattiq `GENERATED` yozilmaydi): 510 gapning
 * 30 tasi manbadagi tayyor ibora (`SOURCE`), ularni «yasama» deb
 * belgilash kelib chiqishini yo'qotardi. `update` blokida `origin`GA HAM
 * TEGILADI — bu yerda `Payment`/`Contract` kabi qo'lda tuzatiladigan
 * ekran, endpoint yoki skript YO'Q: `dafSentence.*` yozuvi butun repoda
 * shu fayldan boshqa joyda ishlatilmaydi, ya'ni «bazadagi qiymat qo'lda
 * tuzatilgan» degan himoya yo'q. Kalit (`order`) esa pozitsion: bo'limdagi
 * gaplar soni o'zgarsa, eski qatorning matni yangilanadi-yu, `origin`
 * o'sha eski (endi noto'g'ri) qatorga tegishli bo'lib qolib ketardi —
 * model yozgan gap mangu «manba» deb belgilanardi.
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
    assertUnitIsRetired(unit, u.order);

    // Bo'limning mavjud qatorlari BITTA so'rovda o'qiladi: har gap uchun
    // alohida `findUnique` o'rniga — audioKey taqqoslash ham, yetim
    // qatorlarni topish ham shu ro'yxatdan foydalanadi.
    const existingRows = await prisma.dafSentence.findMany({
      where: { unitId: unit.id },
    });
    const existingByOrder = new Map(existingRows.map((r) => [r.order, r]));
    const liveOrders = new Set<number>();

    for (const [i, s] of u.sentences.entries()) {
      const order = i + 1;
      liveOrders.add(order);
      const origin = toSentenceOrigin(s.origin, `A1 #${u.order} gap ${order}`);
      const existing = existingByOrder.get(order);

      // `audioKey` TTS o'lchovining natijasi, gap matnining tahriri
      // emas — lekin matn o'zgarsa eski ovoz ENDI NOTO'G'RI gapga
      // tegishli: bu «bosib o'tish» emas, bekor qilish. Shuning uchun
      // `de` o'zgarganda `audioKey` `null`ga tushadi (TTS uni qayta
      // yasaydi), `de` o'zgarmasa esa update'ga umuman kiritilmaydi —
      // Prisma'da yo'q kalit = tegilmagan maydon.
      const audioReset = existing !== undefined && existing.de !== s.de;

      // `unitId_order` ENDI NOYOB EMAS (qarang `DafSentence`dagi izoh),
      // shuning uchun atomik `upsert` o'rniga yuqorida allaqachon
      // o'qilgan `existingByOrder`dan foydalanib qo'lda create/update
      // qilinadi — natija xuddi avvalgi `upsert` bilan bir xil.
      if (existing) {
        await prisma.dafSentence.update({
          where: { id: existing.id },
          data: {
            de: s.de,
            uz: s.uz,
            wordCount: countWords(s.de),
            origin,
            ...(audioReset ? { audioKey: null } : {}),
          },
        });
      } else {
        await prisma.dafSentence.create({
          data: {
            unitId: unit.id,
            order,
            de: s.de,
            uz: s.uz,
            wordCount: countWords(s.de),
            origin,
          },
        });
      }
      n++;
    }

    // Fayldan tushib qolgan gap bazada YETIM qoladi: kalit (`order`)
    // pozitsion, ya'ni bo'lim 516 dan 510 gapga tushganda eski 511–516
    // qatorlar hech kimga ishora qilmay, lekin mashqqa chiqishi mumkin
    // bo'lib qolaveradi. `DafExercise`dan farqli o'laroq (uni attempt
    // tarixi ishora qiladi — shuning uchun u `retiredAt` bilan
    // nafaqaga chiqariladi), `DafSentence.id`ga hech qaysi jadval
    // ishora qilmaydi (Hören mashqi hali 9-taskda yozilmagan) — demak
    // `removeMissingLexemes` naqshi to'g'ri keladi: saqlanadigan tarix
    // yo'q, shuning uchun qattiq o'chiriladi.
    const staleIds = existingRows
      .filter((r) => !liveOrders.has(r.order))
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await prisma.dafSentence.deleteMany({ where: { id: { in: staleIds } } });
    }
  }

  return n;
}
