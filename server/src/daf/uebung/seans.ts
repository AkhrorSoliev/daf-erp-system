import type { Frage, FrageFormat } from './frage.types';

export const FORMAT_MAX_PRO_SEANS = 3;
export const MIN_FORMATE = 5;

export interface SeansPlan {
  fragen: Frage[];
  verwendeteFormate: FrageFormat[];
}

/**
 * Seans tarkibi.
 *
 * NEGA QOIDA KERAK. Tasodifiy tanlov bir seansda o'n ikki marta
 * `WORT_UZ` berishi mumkin — mexanik jihatdan to'g'ri, lekin o'quvchi
 * uchun bu bitta mashqni o'n ikki marta bajarish. Zerikish aynan
 * shundan tug'iladi, materialning kamligidan emas.
 *
 * Beshta qoida: format seansda uch martadan ko'p emas; ketma-ket ikki
 * savol bir formatda emas; kamida besh xil format; bir material bir
 * marta; nomzod yetmasa TAKRORLAMAYDI — kamroq savol beradi.
 *
 * Oxirgisi ataylab: o'n ikkitaga yetkazish uchun savolni takrorlash
 * o'quvchiga «material tugadi» deb aytishning eng yomon usuli.
 */
export function baueSeans(
  kandidaten: Frage[],
  anzahl: number,
  rnd: () => number,
  pflicht: Frage[] = [],
): SeansPlan {
  const uebrig = [...kandidaten];
  // Tasodifiy tartib: har seans boshqacha boshlansin.
  for (let i = uebrig.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [uebrig[i], uebrig[j]] = [uebrig[j], uebrig[i]];
  }

  // Muddati kelgan so'zlar birinchi navbatda: ular seansning sababi.
  // Ular ham beshta qoidaga bo'ysunadi — «majburiy» degani «qoidasiz»
  // degani emas, aks holda ketma-ket ikki bir xil format chiqib qolardi.
  uebrig.unshift(...pflicht);

  const fragen: Frage[] = [];
  const proFormat = new Map<FrageFormat, number>();
  const benutzteItems = new Set<string>();

  while (fragen.length < anzahl) {
    const letzte = fragen[fragen.length - 1]?.format;
    const index = uebrig.findIndex((q) => {
      if (q.format === letzte) return false;
      if ((proFormat.get(q.format) ?? 0) >= FORMAT_MAX_PRO_SEANS) return false;
      return !benutzteItems.has(`${q.itemType}:${q.itemId}`);
    });
    if (index === -1) break;

    const [gewaehlt] = uebrig.splice(index, 1);
    fragen.push(gewaehlt);
    proFormat.set(gewaehlt.format, (proFormat.get(gewaehlt.format) ?? 0) + 1);
    benutzteItems.add(`${gewaehlt.itemType}:${gewaehlt.itemId}`);
  }

  return { fragen, verwendeteFormate: [...proFormat.keys()] };
}
