import { normalisieren } from './antwort';
import {
  materialSchluessel,
  type Frage,
  type MaterialDialog,
  type MaterialDialogZeile,
} from './frage.types';

/** Savol qurish uchun dialogda kamida shuncha satr bo'lishi shart. */
const MIN_ZEILEN = 4;

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Dialogdan bir satr olib tashlanadi — o'quvchi qolgan suhbatdan kelib
 * chiqib, o'sha o'rinda nima aytilgan bo'lishi mumkinligini topadi.
 *
 * BIRINCHI SATR HECH QACHON OLIB TASHLANMAYDI: usiz suhbat kontekstsiz
 * boshlanadi va topshiriq "nima gaplashilyapti" degan taxminga aylanadi.
 * Bu qoida tanlov puliga QAT'IY YOZILGAN — nomzod ro'yxati
 * `zeilen.slice(1)` dan tuziladi, ya'ni tasodifiy generator qanchalik
 * yomon bo'lmasin (hatto doim bir xil qiymat qaytarsa ham) birinchi
 * satr hech qachon tanlanmaydi.
 *
 * CHALG'ITUVCHILAR FAQAT BOSHQA DIALOGLARDAN (`andere`): shu dialogning
 * o'z satri chalg'ituvchi bo'lsa, u ko'p hollarda kontekstga HAQIQATDA
 * mos keladi (masalan boshqa satr ham "salomlashish" bo'lishi mumkin),
 * ya'ni "xato" javob aslida to'g'ri bo'lib chiqishi mumkin edi. Shuning
 * uchun shu dialogning satrlari `andere`dan chiqarib tashlanadi — hatto
 * chaqiruvchi ularni chetlab o'tishni unutgan taqdirda ham (himoya
 * qatlami, `wort-fragen.ts`dagi `ablenker`ga o'xshash).
 *
 * BU TEKSHIRUV IKKI QATLAMLI, IKKALASI HAM SHART: `id` bo'yicha
 * (`eigeneIds`) VA matn bo'yicha (`eigeneNormTexte`). Faqat `id`
 * yetarli emas — nomzod boshqa `id` bilan kelib, lekin MATNI shu
 * dialogning biror satriga (nafaqat olib tashlangan satrga) teng bo'lsa
 * ham, u haligacha "shu dialogning gapi" va chalg'ituvchi bo'la
 * olmaydi. Matn to'plami BUTUN dialogni qamrab oladi (faqat olib
 * tashlangan `ziel` emas): shu bilan bir yo'la richtigdan FAQAT tinish
 * belgisi bilan farq qiladigan nomzod ham chetlanadi — `ziel`ning o'zi
 * ham `dialog.zeilen` ichida, demak uning matni ham shu to'plamda.
 * `normalisieren` bilan solishtiriladi — grading ham shu funksiya
 * orqali ishlaydi, xom teng emas solishtirilsa tinish belgisi bilan
 * farq qiladigan nomzod ham "to'g'ri" bo'lib qolardi (`satzUebersetzen`
 * bilan bir xil sabab).
 *
 * TAKRORLANGAN MATNLI SATR NISHON BO'LA OLMAYDI (ko'rik topilmasi,
 * CRITICAL): ba'zi dialoglarda bir xil gap ikki marta aytiladi (masalan
 * `u01-d3`da ikkala tomon ham "Guten Tag!" deydi, keyin ikkalasi ham
 * "Auf Wiedersehen!" deydi). Shu matn nishon qilib tanlansa, bo'shatilgan
 * qatorning javobi suhbatning BOSHQA (bo'shatilmagan) qatorida so'zma-so'z
 * ko'rinib turadi — savol o'zi javob berib qo'yadi. Shuning uchun butun
 * dialogda matni BIRDAN ORTIQ marta uchraydigan (`normalisieren` bo'yicha)
 * har qanday satr — shu jumladan birinchi satr bilan bir xil matnli
 * ikkinchi nusxa ham — nomzodlar ro'yxatidan chetlanadi.
 *
 * NOMZODNING MATNI BOSHQA QATORNING ICHIDA YOTGAN BO'LSA HAM CHIQARIB
 * TASHLANADI (ko'rik topilmasi, CRITICAL — ikkinchi mexanizm). Yuqoridagi
 * tuzatish faqat ANIQ TENG matnli takrorni ushlaydi. Lekin haqiqiy
 * kontentda (`u01-d2`, `u01-d5`, `u01-d6`) nishonning matni boshqa
 * qatorning matni ICHIDA qism-satr sifatida yotadi — matnlar bir-biriga
 * teng EMAS, shuning uchun chastota filtri buni sinamaydi. Masalan
 * `u01-d2`da nishon "Guten Abend!" (Mia) — birinchi qator "Guten Abend,
 * Mia!" (Walter) shu matnni so'zma-so'z o'z ichiga oladi; agar
 * "Guten Abend!" bo'shatilsa, "Guten Abend, Mia!" o'zgarishsiz ko'rinib,
 * javobni oshkor qiladi. Shuning uchun nomzodning normallashtirilgan
 * matni BOSHQA (o'zidan farqli `id`li) hech bir qatorning
 * normallashtirilgan matni ICHIDA topilmasligi kerak — `includes()`
 * orqali, ikkala yo'nalishda ham (nishon boshida ham, oxirida ham
 * yotgan holat) tekshiriladi. Hech bir nomzod qolmasa (`u01-d3`,
 * `u01-d2`, `u01-d5`, `u01-d6` — hech birida bunday emas: mos ravishda
 * uch, to'rt, besh va besh nomzod qoladi), `null` qaytariladi: format
 * shunchaki bu dialog uchun ishlamaydi.
 */
export function dialogLuecke(
  dialog: MaterialDialog,
  andere: MaterialDialogZeile[],
  rnd: () => number,
): Frage | null {
  if (dialog.zeilen.length < MIN_ZEILEN) return null;

  const matnSoni = new Map<string, number>();
  for (const z of dialog.zeilen) {
    const key = normalisieren(z.de);
    matnSoni.set(key, (matnSoni.get(key) ?? 0) + 1);
  }

  // Nomzodning matni boshqa BIRON qatorning ICHIDA (qism-satr sifatida)
  // yotadimi — matnlar teng bo'lmasa ham. Shu bilan bir yo'la ANIQ teng
  // takrorni ham qamrab oladi (bir satr o'z-o'zining ichida bo'ladi),
  // lekin u holat allaqachon chastota filtri bilan ham ushlanadi.
  const ichidaYotadimi = (nomzod: MaterialDialogZeile): boolean => {
    const nomzodMatni = normalisieren(nomzod.de);
    return dialog.zeilen.some(
      (boshqa) =>
        boshqa.id !== nomzod.id &&
        normalisieren(boshqa.de).includes(nomzodMatni),
    );
  };

  // Birinchidan boshqa, matni butun dialogda faqat bitta marta
  // uchraydigan VA boshqa hech qanday qatorning ichida yotmagan satrlar
  // — pastga qarang, nega uchalasi ham shart.
  const nomzodlar = dialog.zeilen
    .slice(1)
    .filter((z) => matnSoni.get(normalisieren(z.de)) === 1)
    .filter((z) => !ichidaYotadimi(z));
  if (nomzodlar.length === 0) return null;
  const ziel = mischen(nomzodlar, rnd)[0];

  const eigeneIds = new Set(dialog.zeilen.map((z) => z.id));
  const eigeneNormTexte = new Set(
    dialog.zeilen.map((z) => normalisieren(z.de)),
  );
  const falschKandidaten = andere
    .filter(
      (z) => !eigeneIds.has(z.id) && !eigeneNormTexte.has(normalisieren(z.de)),
    )
    .map((z) => z.de);
  const falsch = [...new Set(falschKandidaten)];
  if (falsch.length < 3) return null;

  // Butun suhbat — bo'shatilgan satr o'rnida `___`. To'g'ri javob (ziel.de)
  // boshqa hech qanday qatorda chiqmasligi kerak, aks holda savol o'zi
  // javob berib qo'yardi.
  const prompt = dialog.zeilen
    .map((z) =>
      z.id === ziel.id ? `${z.sprecher}: ___` : `${z.sprecher}: ${z.de}`,
    )
    .join('\n');

  return {
    format: 'DIALOG_LUECKE',
    itemType: 'DIALOGZEILE',
    itemId: ziel.id,
    prompt,
    hilfe: null,
    options: mischen([ziel.de, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.de,
    akzeptiert: [],
    belegteItems: [materialSchluessel('DIALOGZEILE', ziel.id)],
    // Natija ekrani xato ro'yxatida BUTUN suhbat (`prompt`) o'rniga shu
    // qisqa nomni ko'rsatadi — qarang `frage.types.ts`dagi `titel` izohi.
    titel: dialog.titelDe,
    audioUrl: null,
  };
}
