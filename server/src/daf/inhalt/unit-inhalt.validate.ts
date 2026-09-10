import type { WoerterFile, RedemittelFile } from './unit-inhalt.types';

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
