import { BadRequestException } from '@nestjs/common';
import type { FrageFormat, ItemType } from './frage.types';

// The correct answer, recomputed from the material (design D7). Moved out of
// `uebung.service.ts`, which is far past the 500-line limit, when the
// picture formats were added (2026-09-27).

/**
 * To'g'ri javob MATERIALDAN qaytadan hisoblanadi, savoldan emas.
 *
 * `LUECKE` ENDI ODATDAGI SO'Z SAVOLI: `luecke` bo'shatilgan so'zning
 * `id`sini `itemId` sifatida qaytaradi (`itemType: 'WORT'`), shuning
 * uchun to'g'ri javob boshqa har qanday so'z savoli kabi — o'sha so'zning
 * `de`si — qaytadan hisoblanadi. Gap qaysi so'z olib tashlangani savol
 * qurilganda tasodifiy tanlangan bo'lsa ham, MUAMMO EMAS: natija allaqachon
 * savolning o'zligiga yozib qo'yilgan, qayta tanlash kerak emas.
 *
 * `PAAR` bundan boshqacha: to'rt juftning qaysilari tushgani ham
 * tasodifiy, lekin ularni bitta "to'g'ri javob" satriga sig'dirib
 * bo'lmaydi (to'rtta so'z, to'rtta natija). Shuning uchun `PAAR` bu
 * funksiyaga UMUMAN yetib kelmaydi — `pruefen` uni bundan OLDIN o'z yo'li
 * bilan (juft-juft) tekshiradi.
 */
export function richtigeAntwort(
  format: FrageFormat,
  material: {
    de: string;
    uz: string;
    artikel?: string | null;
    akzeptiert?: string[];
  },
): { richtig: string; akzeptiert: string[] } {
  switch (format) {
    case 'WORT_UZ':
    case 'SATZ_UEBERSETZEN':
      return { richtig: material.uz, akzeptiert: [] };
    case 'UZ_WORT':
      return {
        richtig: material.artikel
          ? `${material.artikel} ${material.de}`
          : material.de,
        akzeptiert: [material.de],
      };
    case 'ARTIKEL':
      if (!material.artikel) {
        throw new BadRequestException("Bu so'zda artikl yo'q");
      }
      return { richtig: material.artikel, akzeptiert: [] };
    case 'SATZ_BAUEN':
      // Gapning boshqa to'g'ri so'z tartiblari ham qabul qilinadi
      // («In Deutschland wohne ich.» ↔ «Ich wohne in Deutschland.») —
      // o'quvchi aynan shu so'zlardan to'g'ri nemischa gap tuzgan bo'lsa,
      // uni «xato» deyish to'g'ri javobni jazolash bo'lardi. Ro'yxat
      // kontentda qo'lda yoziladi (`saetze.json` → `akzeptiert`), qo'riqchi
      // har biri aynan o'sha so'zlardan tuzilganini tekshiradi.
      return { richtig: material.de, akzeptiert: material.akzeptiert ?? [] };
    case 'LUECKE':
    case 'REAKTION':
    case 'DIALOG_LUECKE':
      // `DIALOG_LUECKE` — `LUECKE` bilan bir xil oddiy hol: to'g'ri javob
      // olib tashlangan satrning nemischasi, boshqa hech narsa hisobga
      // olinmaydi (dialog satri Leitner narvoniga kirmaydi — pastdagi
      // `itemType === 'WORT'` sharti buni allaqachon ta'minlaydi).
      return { richtig: material.de, akzeptiert: [] };
    case 'HOEREN_WAHL':
      // `ladeMaterial` `de`ga `DafHoerFrage.richtig`ni qo'yadi.
      // `akzeptiert` bo'sh: variantlar aynan, yozish yo'q.
      return { richtig: material.de, akzeptiert: [] };
    case 'AUDIO_WORT':
      // To'g'ri javob — eshitilgan so'zning o'zi (`ziel.de`, artiklsiz —
      // `wort-fragen.ts`dagi `audioWort` bilan bir xil). Bu holat yo'q
      // qolib ketsa, `pruefen` yuqoridagi `default`ga tushib, savol
      // ko'rsatilgandan keyin JAVOB BERISHNING O'ZI 400 bilan yiqilardi.
      //
      // `akzeptiert` BO'SH bo'lishi shart: bu TANLASH savoli va
      // variantlar `ziel.de` dan quriladi, ya'ni artiklli shakl ekranda
      // umuman yo'q. Uni qabul qilinadigan qilish hech kimga yordam
      // bermaydi, lekin variantlardan tashqari javobga yo'l ochardi.
      return { richtig: material.de, akzeptiert: [] };
    case 'WORT_TIPPEN':
      // YOZISH savoli, shuning uchun `AUDIO_WORT` dan farq qiladi: ot
      // artikli bilan o'rganiladi (`UZ_WORT` ning to'g'ri javobi aynan
      // `der Name`), va eshitib yozayotgan o'quvchi shuni yozishi tabiiy.
      // Audio faqat so'zning o'zini aytadi, shuning uchun ASOSIY javob
      // `material.de` bo'lib qoladi va artiklli shakl QO'SHIMCHA qabul
      // qilinadi. Teskarisi — artiklni majburlash — o'quvchini eshitmagan
      // so'zini yozishga majburlardi.
      return {
        richtig: material.de,
        akzeptiert: material.artikel
          ? [`${material.artikel} ${material.de}`]
          : [],
      };
    case 'BILD_TIPPEN':
      // Typed from the picture alone, so the article is part of the answer:
      // the instruction asks for it and the colour of the answer shows it.
      if (!material.artikel) {
        throw new BadRequestException("Bu so'zda artikl yo'q");
      }
      return { richtig: `${material.artikel} ${material.de}`, akzeptiert: [] };
    default:
      throw new BadRequestException(
        `${format} javobi hozircha tekshirilmaydi — savol o'zligi kengayishi kerak`,
      );
  }
}

/**
 * Picture choice (`BILD_WORT`, `AUDIO_BILD`): the answer is the word's own
 * picture URL, compared exactly — a URL is not text, so none of the
 * spelling forgiveness applies. `loesungWort` names the word; it is sent
 * after the answer so the student learns what they heard or saw.
 */
export function bildAntwort(
  itemType: ItemType,
  material: { de: string; artikel?: string | null; imageKey?: string | null },
  given: string,
  mediaUrl: (key: string) => string | null,
): { isCorrect: boolean; richtig: string; loesungWort: string } {
  if (itemType !== 'WORT') {
    // The DTO checks `itemType` and `format` independently, like PAAR.
    throw new BadRequestException("Rasmli savol faqat so'zga tegishli");
  }
  const url = material.imageKey ? mediaUrl(material.imageKey) : null;
  if (!url) {
    throw new BadRequestException("Bu so'zda rasm yo'q");
  }
  return {
    isCorrect: given === url,
    richtig: url,
    loesungWort: material.artikel
      ? `${material.artikel} ${material.de}`
      : material.de,
  };
}
