import type {
  WoerterFile,
  RedemittelFile,
  HilfswoerterFile,
  Wort,
} from './unit-inhalt.types';

/**
 * Unit ichida matn NOYOB bo'lishi.
 *
 * NEGA KONTENT QOIDASI, KOD QOIDASI EMAS. Jonli juftlash (`juft()`,
 * `uebung/uebung.service.ts`) materialni MATN bo'yicha qidiradi:
 * so'zni `de` + `unitId`, iborani `funktionUz` + `unitId` bo'yicha.
 * Protokolda qaysi NUSXA ekranda turgani aytilmaydi — mijoz matnni
 * yuboradi, `lexemeId`ni emas.
 *
 * Javob to'g'ri bo'lsa mos nomzod tanlanadi, lekin javob CHINDAN xato
 * bo'lsa hech biri mos kelmaydi va birinchisiga tushiladi: unitda
 * `die Bank` → «bank» va `die Bank` → «o'rindiq» bo'lsa, ekranda
 * ikkinchisi tursa ham birinchisi jazolanadi. Jazolangan so'z
 * «muddati kelgan» bo'lib qoladi va keyingi to'g'ri bosish ball
 * beradi — ya'ni **«tuzatish bepul» qoidasi buziladi**.
 *
 * Kodda yopish so'rov shaklini o'zgartirishni talab qiladi (`lexemeId`
 * yuborish). Kontentda yopish arzonroq va shu qoida aynan shuning
 * uchun bor: 1-unit tekshirilgan va toza, yangi unit ham shunday
 * kirsin.
 *
 * SOLISHTIRUV AYNAN — bazadagi qidiruv ham aynan (`where: { de }`),
 * shuning uchun bu yerda katta-kichik harf yoki bo'shliq
 * normalizatsiya qilinmaydi: `Bank` va `bank` bazada IKKI xil qator va
 * ular bir-birini jazolamaydi.
 */
export function validateEindeutigkeit(
  woerter: WoerterFile,
  redemittel: RedemittelFile | null,
): string[] {
  const problems: string[] = [];

  problems.push(
    ...duplikate(
      woerter.woerter.map((w) => w.de),
      (text, n) =>
        `${woerter.unit}: «${text}» so'zi ${n} marta — unit ichida ` +
        `takroriy 'de' juftlashda noto'g'ri so'zni jazolaydi`,
    ),
  );

  if (redemittel) {
    problems.push(
      ...duplikate(
        redemittel.phrasen.map((p) => p.funktionUz),
        (text, n) =>
          `${redemittel.unit}: «${text}» vaziyati ${n} marta — unit ` +
          `ichida takroriy 'funktionUz' ZUORDNEN javobini buzadi`,
      ),
    );
  }

  return problems;
}

function duplikate(
  texte: string[],
  nachricht: (text: string, anzahl: number) => string,
): string[] {
  const anzahl = new Map<string, number>();
  for (const t of texte) anzahl.set(t, (anzahl.get(t) ?? 0) + 1);
  return [...anzahl.entries()]
    .filter(([, n]) => n > 1)
    .map(([text, n]) => nachricht(text, n));
}

/**
 * Yordamchi so'zlar ro'yxatining o'zi tekshiriladi.
 *
 * ENG MUHIM QOIDA — ro'yxatda hech bir unitning ASOSIY so'zi turmasin.
 * Yordamchi so'z progressiya tekshiruvidan OZOD, ya'ni o'rgatilgan
 * bo'limdan qat'i nazar hamma joyda ishlatilaveradi. Asosiy so'z u yerga
 * tushib qolsa, u o'z bo'limidan OLDIN ishlatilganda ham qo'riqchi
 * jim qoladi — ya'ni ro'yxat qo'riqchini o'chirish tugmasiga aylanadi.
 *
 * `grund` majburiy bo'lishining sababi ham shu: «notanish so'z» xatosini
 * ko'rgan odam so'zni ro'yxatga qo'shib qutulishi mumkin, va yozilgan
 * sabab shu qadamni ko'rinadigan qiladi.
 */
export function validateHilfswoerter(
  hilfs: HilfswoerterFile,
  alleWoerter: Wort[],
): string[] {
  const problems: string[] = [];

  const kern = new Map<string, string>();
  for (const w of alleWoerter) {
    if (w.core) kern.set(w.de.toLowerCase(), w.sourceId);
  }

  const gesehen = new Set<string>();
  for (const e of hilfs.eintraege) {
    const wort = e.wort.toLowerCase();

    if (gesehen.has(wort)) problems.push(`${e.wort}: ro'yxatda ikki marta`);
    gesehen.add(wort);

    if (e.grund.trim() === '') {
      problems.push(`${e.wort}: sababi yozilmagan`);
    }

    const kernId = kern.get(wort);
    if (kernId !== undefined) {
      problems.push(
        `${e.wort}: asosiy so'z (${kernId}) — yordamchi ro'yxatda tura olmaydi, ` +
          `aks holda o'z bo'limidan oldin ishlatilgani ko'rinmay qoladi`,
      );
    }
  }

  return problems;
}
