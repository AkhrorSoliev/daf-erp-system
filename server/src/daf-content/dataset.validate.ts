import type { AssetRef, DafDataset } from './dataset.types';

/**
 * Dataset commit qilinishidan oldingi qorovul. Xatolar ro'yxatini qaytaradi —
 * bo'sh ro'yxat «toza» degani. Exception tashlamaydi: skript hamma muammoni
 * bir yo'la ko'rsatishi kerak, birinchisida to'xtab qolmasligi.
 */
export function validateDataset(d: DafDataset): string[] {
  const errors: string[] = [];

  const checkAsset = (a: AssetRef | null) => {
    if (!a) return;
    if (!a.license.trim()) errors.push(`${a.key}: litsenziya ko'rsatilmagan`);
    if (!a.attribution.trim()) errors.push(`${a.key}: muallif ko'rsatilmagan`);
  };

  // Bo'lim id'lari OLDINDAN, alohida o'tishda to'planadi. Bitta o'tishda
  // tekshirish nosog'lom edi: hali ko'rilmagan (ro'yxatda pastroqda turgan)
  // bo'limga havola soxta xato bo'lib chiqar, ko'rilgan-u aloqasiz bo'limga
  // havola esa aksincha o'tkazib yuborilardi. Ikki bosqichli tekshiruv buni
  // yopadi: yozuvlar to'liq to'plamga tekshiriladi, ketma-ketlikdan qat'i
  // nazar.
  const sectionIds = new Set<string>();
  for (const s of d.sections) {
    if (sectionIds.has(s.id)) errors.push(`${s.id}: bo'lim id'si takrorlangan`);
    sectionIds.add(s.id);
  }

  for (const s of d.sections) {
    checkAsset(s.audio);

    for (const e of s.entries) {
      if (!e.de.trim()) errors.push(`${s.id}: bo'sh \`de\` qiymati bor`);
      if (!e.en.trim()) errors.push(`${s.id}: bo'sh \`en\` qiymati bor`);
      if (!sectionIds.has(e.sectionId)) {
        errors.push(`${s.id}: \`${e.sectionId}\` bo'limi mavjud emas`);
      }
    }
  }

  // Transkript id'si manba fayl nomi (masalan `07_04_int_hm_gesundleben`) —
  // Faza 2'da `DafTranscript` shu id bo'yicha kalitlanadi, shuning uchun
  // takrorlanish shu yerda ushlanishi shart, DB'ning unique cheklovigacha
  // yetib bormasdan.
  const transcriptIds = new Set<string>();
  for (const t of d.transcripts) {
    if (transcriptIds.has(t.id)) {
      errors.push(`${t.id}: transkript id'si takrorlangan`);
    }
    transcriptIds.add(t.id);
    if (t.linesDe.length === 0) errors.push(`${t.id}: nemischa matn bo'sh`);
    checkAsset(t.video);
  }

  // `d.videos` — transkriptidan qat'i nazar, manbadagi HAR BIR video. Xuddi
  // bo'lim audiosi va transkript videosi kabi, litsenziyasiz aktiv bu yerda
  // ham o'tkazilmasligi kerak — va R2 kaliti ham takrorlanmasligi kerak.
  const videoKeys = new Set<string>();
  for (const v of d.videos) {
    if (videoKeys.has(v.key))
      errors.push(`${v.key}: video kaliti takrorlangan`);
    videoKeys.add(v.key);
    checkAsset(v);
  }

  const grammarCodes = new Set<string>();
  for (const g of d.grammar) {
    if (grammarCodes.has(g.code)) {
      errors.push(`${g.code}: grammatika kodi takrorlangan`);
    }
    grammarCodes.add(g.code);

    for (const a of g.audio) checkAsset(a);

    for (const ex of g.exercises) {
      // `___` qoidasi faqat GAP va CLOZE uchun: REORDER'da bo'sh joy o'rniga
      // tartiblanadigan `tokens` ro'yxati bo'lishi shart.
      if (ex.kind === 'REORDER') {
        if (!ex.tokens || ex.tokens.length === 0) {
          errors.push(`${ex.id}: REORDER mashqida \`tokens\` ro'yxati bo'sh`);
        }
      } else if (!ex.sentenceDe.includes('___')) {
        errors.push(`${ex.id}: gapda bo'sh joy (___) yo'q`);
      }

      if (ex.kind === 'CLOZE') {
        const blanksInText = (ex.sentenceDe.match(/___/g) ?? []).length;
        if (ex.blankCount !== blanksInText) {
          errors.push(
            `${ex.id}: \`blankCount\` (${ex.blankCount}) matndagi bo'sh joylar soniga (${blanksInText}) mos kelmaydi`,
          );
        }
      }

      // MC `___` qoidasini yuqoridagi umumiy tekshiruvdan OLADI (REORDER
      // emas, shuning uchun `else if` shoxobchasiga tushadi) — alohida
      // istisno emas. Bu yerda faqat MC'ga xos qoida qo'shiladi: kamida
      // ikkita variant bo'lmasa, o'quvchi tanlaydigan hech narsa yo'q.
      if (ex.kind === 'MC' && (!ex.options || ex.options.length < 2)) {
        errors.push(
          `${ex.id}: MC mashqida kamida ikkita \`options\` bo'lishi shart`,
        );
      }
    }
  }

  const phoneticsIds = new Set<string>();
  for (const p of d.phonetics) {
    if (phoneticsIds.has(p.id)) {
      errors.push(`${p.id}: talaffuz id'si takrorlangan`);
    }
    phoneticsIds.add(p.id);
    checkAsset(p.audio);
  }

  for (const doc of d.documents) checkAsset(doc);

  for (const s of d.sections) {
    for (const e of s.entries) {
      if (e.image) checkAsset(e.image);
    }
  }

  return errors;
}
