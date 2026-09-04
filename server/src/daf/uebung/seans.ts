import type { Frage, FrageFormat } from './frage.types';

export const FORMAT_MAX_PRO_SEANS = 3;
export const MIN_FORMATE = 5;

export interface SeansPlan {
  fragen: Frage[];
  verwendeteFormate: FrageFormat[];
  /**
   * Joylasholmagan majburiy (pflicht) savollar — cap haqiqatda to'lgani
   * yoki ketma-ketlik qoidasi uchun bo'shliq yaratib bo'lmagani sababli.
   * Bo'sh massiv — barcha majburiy savol joylashdi. Bu yerda yashirincha
   * yo'qolmaydi: chaqiruvchi ko'rib, keyingi qadamni (masalan, boshqa
   * seansga qoldirish yoki logga yozish) o'zi hal qiladi.
   */
  nichtPlatziert: Frage[];
}

const schluessel = (f: Frage): string => `${f.itemType}:${f.itemId}`;

/**
 * Seans tarkibi.
 *
 * NEGA QOIDA KERAK. Tasodifiy tanlov bir seansda o'n ikki marta
 * `WORT_UZ` berishi mumkin — mexanik jihatdan to'g'ri, lekin o'quvchi
 * uchun bu bitta mashqni o'n ikki marta bajarish. Zerikish aynan
 * shundan tug'iladi, materialning kamligidan emas.
 *
 * QOIDALAR (kod haqiqatda shularni ta'minlaydi):
 * 1. Bitta format seansda `FORMAT_MAX_PRO_SEANS` martadan ko'p emas.
 * 2. Ketma-ket ikki savol bir formatda emas.
 * 3. Nomzodlar panelida yetarli xillik bo'lsa, kamida `MIN_FORMATE` xil
 *    format ishlatiladi: panel hali shu songa yetmaguncha, ishlatilmagan
 *    formatdagi nomzod har doim ustunlik oladi — aks holda ochko'z
 *    tanlov to'rt formatni to'ldirib, beshinchisiga hech qachon
 *    yetmasligi mumkin (4 format x cap=3 = 12, aynan so'ralgan son).
 * 4. Bir material (itemType+itemId) bir seansda ikki marta so'ralmaydi.
 * 5. Nomzod yetmasa TAKRORLAMAYDI — kamroq savol beradi.
 *
 * MAJBURIY (pflicht) SAVOLLAR: ular seansning sababi — muddati kelgan
 * so'z bo'lishi mumkin, shuning uchun ODDIY nomzodlardan OLDIN
 * joylashtiriladi. Ketma-ketlik qoidasi ularni ham bog'lasa
 * (ikkinchisi oxirgisi bilan bir xil formatda bo'lsa), pooldan
 * boshqa formatdagi bitta nomzod "bo'shliq" sifatida orasiga qo'yiladi.
 * Faqat CAP haqiqatda to'lgan yoki bo'shliq yaratib bo'lmagan (masalan,
 * nomzodlar tugagan) taqdirdagina majburiy savol tashlab ketiladi — va
 * bu holda u jimgina yo'qolmaydi, natijaning `nichtPlatziert`
 * maydoniga qo'shiladi.
 */
export function baueSeans(
  kandidaten: Frage[],
  anzahl: number,
  rnd: () => number,
  pflicht: Frage[] = [],
): SeansPlan {
  const pool = [...kandidaten];
  // Tasodifiy tartib: har seans boshqacha boshlansin.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const fragen: Frage[] = [];
  const nichtPlatziert: Frage[] = [];
  const proFormat = new Map<FrageFormat, number>();
  const benutzteItems = new Set<string>();

  const joylashtir = (f: Frage): void => {
    fragen.push(f);
    proFormat.set(f.format, (proFormat.get(f.format) ?? 0) + 1);
    benutzteItems.add(schluessel(f));
  };

  // --- 1-bosqich: majburiy savollar ---
  // Ular oddiy nomzodlardan OLDIN joylanadi; kerak bo'lsa pooldan
  // bitta savol "bo'shliq" sifatida orasiga qo'yilib, ketma-ketlik
  // qoidasi saqlanadi.
  let qoldi = [...pflicht];
  while (qoldi.length > 0 && fragen.length < anzahl) {
    const letzte = fragen[fragen.length - 1]?.format;

    // Cap to'lgan yoki materialda takroriy bo'lganlar — bo'shliq
    // yordam bermaydigan holatlar — darhol hisobotga o'tkaziladi.
    const qoladigan: Frage[] = [];
    for (const f of qoldi) {
      const capToldi = (proFormat.get(f.format) ?? 0) >= FORMAT_MAX_PRO_SEANS;
      const ishlatilgan = benutzteItems.has(schluessel(f));
      if (capToldi || ishlatilgan) {
        nichtPlatziert.push(f);
      } else {
        qoladigan.push(f);
      }
    }
    qoldi = qoladigan;
    if (qoldi.length === 0) break;

    const idx = qoldi.findIndex((f) => f.format !== letzte);
    if (idx !== -1) {
      const [f] = qoldi.splice(idx, 1);
      joylashtir(f);
      continue;
    }

    // Qolganlarning barchasi oxirgisi bilan bir xil formatda —
    // pooldan boshqa formatdagi bitta savolni bo'shliq sifatida olamiz.
    const spacerIdx = pool.findIndex(
      (f) =>
        f.format !== letzte &&
        (proFormat.get(f.format) ?? 0) < FORMAT_MAX_PRO_SEANS &&
        !benutzteItems.has(schluessel(f)),
    );
    if (spacerIdx === -1) {
      // Bo'shliq yaratib bo'lmadi — qolganlarini joylashtirib bo'lmaydi.
      nichtPlatziert.push(...qoldi);
      qoldi = [];
      break;
    }
    const [spacer] = pool.splice(spacerIdx, 1);
    joylashtir(spacer);
  }
  // anzahl to'lib, hali navbatidagi majburiylar qolgan bo'lsa ham
  // ular yo'qolmasin — hisobotga qo'shiladi.
  if (qoldi.length > 0) nichtPlatziert.push(...qoldi);

  // --- 2-bosqich: oddiy nomzodlar bilan to'ldirish ---
  while (fragen.length < anzahl) {
    const letzte = fragen[fragen.length - 1]?.format;
    const mosKeladi = (f: Frage): boolean =>
      f.format !== letzte &&
      (proFormat.get(f.format) ?? 0) < FORMAT_MAX_PRO_SEANS &&
      !benutzteItems.has(schluessel(f));

    // Besh xil formatga yetmaguncha ishlatilmagan format ustunlik
    // oladi (3-qoida) — aks holda ochko'z findIndex to'rtta formatni
    // to'ldirib qo'yib, hech qachon beshinchisiga o'tmasligi mumkin.
    let index = -1;
    if (proFormat.size < MIN_FORMATE) {
      index = pool.findIndex((f) => mosKeladi(f) && !proFormat.has(f.format));
    }
    if (index === -1) {
      index = pool.findIndex(mosKeladi);
    }
    if (index === -1) break;

    const [gewaehlt] = pool.splice(index, 1);
    joylashtir(gewaehlt);
  }

  return { fragen, verwendeteFormate: [...proFormat.keys()], nichtPlatziert };
}
