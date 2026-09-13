/**
 * Seans natijasini URINISHLARDAN hisoblaydi (dizayn 5.5) — klient aytgan
 * `richtig`ga ishonilmaydi.
 *
 * Qoidalar:
 * - Savol = `questionIndex`. O'rinbosar savol (`attemptNo` 2) shu indeks
 *   bilan keladi va birinchi urinish natijasini O'ZGARTIRMAYDI.
 * - Oddiy savol: `attemptNo = 1` satrining `score`i 1 bo'lsa to'g'ri.
 * - Juftlash (`PAAR` 4 juft, `ZUORDNEN` 6 juft): har bosish alohida satr.
 *   Birortasi 0 bo'lsa — 0. Hammasi 1 va soni juftlar soniga yetgan bo'lsa
 *   — 1. Aks holda savol hal bo'lmagan (seans tashlab ketilgan) — sanalmaydi.
 * - Faqat `GRADED` satrlar; `PENDING`/`UNGRADED` savollar foizga kirmaydi.
 * - `questionIndex` null (eski klient, eski DiB yo'li) — chetda.
 */
export interface UrinishSatri {
  questionIndex: number | null;
  attemptNo: number | null;
  format: string | null;
  score: number | null;
  gradingStatus: 'GRADED' | 'PENDING' | 'UNGRADED';
}

export interface SeansYigindi {
  questionCount: number;
  firstTryCorrect: number;
}

/** Klientdagi `juftSoni()` bilan BIR XIL: PAAR 4, ZUORDNEN 6. */
export const JUFT_SONI: Record<'PAAR' | 'ZUORDNEN', number> = {
  PAAR: 4,
  ZUORDNEN: 6,
};

function juftFormatmi(format: string | null): format is 'PAAR' | 'ZUORDNEN' {
  return format === 'PAAR' || format === 'ZUORDNEN';
}

export function seansYigindisi(satrlar: UrinishSatri[]): SeansYigindi {
  const savollar = new Map<number, UrinishSatri[]>();
  for (const satr of satrlar) {
    if (satr.questionIndex == null || satr.attemptNo !== 1) continue;
    if (satr.gradingStatus !== 'GRADED') continue;
    const royxat = savollar.get(satr.questionIndex) ?? [];
    royxat.push(satr);
    savollar.set(satr.questionIndex, royxat);
  }

  let questionCount = 0;
  let firstTryCorrect = 0;
  for (const urinishlar of savollar.values()) {
    const format = urinishlar[0].format;
    if (juftFormatmi(format)) {
      // SHARTNOMA: bu tarmoq PAAR/ZUORDNEN qatorlari `juft()`dan kelgani
      // — har bosish o'z alohida qatori (yuqoridagi izohga qarang) — deb
      // faraz qiladi. Butun savolni bitta so'rovda baholaydigan eski
      // `pruefen` yo'li (4 juftni bir yo'la) shu formatga SHU YERGA hech
      // qachon yetib kelmaydi — veb klient PAAR/ZUORDNEN uchun faqat
      // `juft()`ni chaqiradi. Agar u baribir bitta yaxlit qator sifatida
      // kelsa, bu yerda 4/6 taning FAQAT BITTASI deb hisoblanadi va savol
      // hech qachon "hal bo'lgan" holatiga yetmaydi (pastdagi "hal
      // bo'lmagan" shoxobchasiga tushadi). Kelajakda boshqa mijoz (masalan
      // native ilova) qo'shilsa, u ham juftlash javobini `juft()` orqali,
      // juft-juft yuborishi SHART — bitta yaxlit PAAR/ZUORDNEN qatori
      // yubormasin.
      const xatoBor = urinishlar.some((u) => (u.score ?? 0) < 1);
      const togriSoni = urinishlar.filter((u) => u.score === 1).length;
      if (xatoBor) {
        questionCount += 1;
      } else if (togriSoni >= JUFT_SONI[format]) {
        questionCount += 1;
        firstTryCorrect += 1;
      }
      // Xato yo'q, lekin juftlar yetmagan — hal bo'lmagan, sanalmaydi.
      continue;
    }
    questionCount += 1;
    if (urinishlar[0].score === 1) firstTryCorrect += 1;
  }
  return { questionCount, firstTryCorrect };
}
