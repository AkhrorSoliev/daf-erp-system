import type { Frage } from './frage.types';

/**
 * Qoida 5 (dizayn 4.3): ketma-ket ikki SEANSDA bir xil (so'z+format)
 * juftligi takrorlanmaydi. Nomzod ro'yxatidan shu qoidaga zid
 * bo'lganlarni chetlatadi.
 *
 * NEGA HAND-LISTED FORMATLAR RO'YXATI EMAS. Avvalgi kod faqat
 * `WORT_UZ`/`UZ_WORT`/`ARTIKEL` uchun tekshirar edi, chunki ular
 * kandidat quruvchi CHAQIRILISHIDAN OLDIN, bitta so'z uchun alohida
 * tekshirilardi. `LUECKE` va `PAAR` ham xuddi shu so'z-identifikatsiyasini
 * olib yuradi (`belegteItems` ichida `WORT:<id>`), lekin ular BOSHQACHA
 * quriladi (`LUECKE` — gapdan, `PAAR` — to'rtlikdan) va shu ro'yxatga
 * hech qachon qo'shilmagan edi — natijada ular ikkinchi safar ham xuddi
 * shu so'zni xuddi shu formatda qayta so'rar edi. Tekshiruv endi
 * NOMZODNING O'ZIDAN (`belegteItems` + `format`idan) kelib chiqadi,
 * hand-listed ro'yxatdan emas — kelajakda qo'shiladigan har qanday
 * yangi so'z-formatini ham hech kim "ro'yxatga qo'sh" deb ESLAB
 * QOLISHI shart emas.
 *
 * `PAAR` bir nomzodda to'rtta so'zni birdaniga band qiladi
 * (`belegteItems`da to'rttasi ham bor): ULARDAN BIRI ham o'tgan safar
 * aynan PAAR formatida so'ralgan bo'lsa, butun juftlik nomzodi
 * chetlatiladi — aks holda o'sha bitta so'z boshqa uchtasi bilan qayta
 * ko'rsatilib, aslida ikkinchi marta xuddi shu shaklda so'ralgan
 * bo'lardi.
 */
export function ohneWiederholteFormate(
  kandidaten: Frage[],
  letzterFormatByWort: Map<number, string | null>,
): Frage[] {
  return kandidaten.filter(
    (f) => !bandSoezShuFormatdaTakrorlandi(f, letzterFormatByWort),
  );
}

function bandSoezShuFormatdaTakrorlandi(
  f: Frage,
  letzterFormatByWort: Map<number, string | null>,
): boolean {
  return f.belegteItems.some((schluessel) => {
    const [tur, idText] = schluessel.split(':');
    if (tur !== 'WORT') return false;
    return letzterFormatByWort.get(Number(idText)) === f.format;
  });
}
