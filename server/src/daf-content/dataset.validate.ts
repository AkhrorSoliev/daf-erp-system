import type { AssetRef, DafDataset } from './dataset.types';

/**
 * Dataset commit qilinishidan oldingi qorovul. Xatolar ro'yxatini qaytaradi —
 * bo'sh ro'yxat «toza» degani. Exception tashlamaydi: skript hamma muammoni
 * bir yo'la ko'rsatishi kerak, birinchisida to'xtab qolmasligi.
 */
export function validateDataset(d: DafDataset): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  const checkAsset = (a: AssetRef | null) => {
    if (!a) return;
    if (!a.license.trim()) errors.push(`${a.key}: litsenziya ko'rsatilmagan`);
    if (!a.attribution.trim()) errors.push(`${a.key}: muallif ko'rsatilmagan`);
  };

  for (const s of d.sections) {
    if (seen.has(s.id)) errors.push(`${s.id}: bo'lim id'si takrorlangan`);
    seen.add(s.id);
    checkAsset(s.audio);

    for (const e of s.entries) {
      if (!e.de.trim()) errors.push(`${s.id}: bo'sh \`de\` qiymati bor`);
      if (!e.en.trim()) errors.push(`${s.id}: bo'sh \`en\` qiymati bor`);
      if (!seen.has(e.sectionId) && e.sectionId !== s.id) {
        errors.push(`${s.id}: \`${e.sectionId}\` bo'limi mavjud emas`);
      }
    }
  }

  for (const t of d.transcripts) {
    if (t.linesDe.length === 0) errors.push(`${t.id}: nemischa matn bo'sh`);
    checkAsset(t.video);
  }

  // `d.videos` — transkriptidan qat'i nazar, manbadagi HAR BIR video. Xuddi
  // bo'lim audiosi va transkript videosi kabi, litsenziyasiz aktiv bu yerda
  // ham o'tkazilmasligi kerak.
  for (const v of d.videos) {
    checkAsset(v);
  }

  return errors;
}
