/**
 * Jang eshitish savollari uchun so'z ovozlarining uzunligi (spec §4).
 *
 * Nega DB'dan: `audioStartMs`/`audioEndMs` to'ldirilgan so'z umumiy bo'lim
 * faylining bir bo'lagi — uzunligi oraliqdan olinadi, faylni o'lchash
 * BUTUN bo'limni o'lchaydi.
 *
 * Oraliqsiz so'z ikki xil bo'lishi mumkin va ustunlar darajasida ular bir xil
 * ko'rinadi (`audioKey` bor, oraliq `null`): A1 generatori har so'zga ALOHIDA
 * fayl yozadi (o'z fayli), eski bo'lim fayli esa bir nechta so'zga umumiy va
 * align qilinmagan. Faylning qisqaligi ishonchli belgi emas: 2–3 so'zli kichik
 * bo'lim fayli ham ≤ 3000 ms chiqadi va bir necha so'z birga o'ynab ketadi.
 * Shuning uchun `daf-media-coverage.service.ts`dagi qoida: audioKey FAQAT bitta
 * so'zniki bo'lsa — o'z fayli, `ffprobe` o'lchaydi; bir nechtaga umumiy
 * bo'lsa-yu oraliq yo'q bo'lsa — o'ynamaydi, tashlanadi. Kalit nechta so'zga
 * tegishli ekani o'sha servis kabi `sectionId` bor BARCHA so'zlar bo'yicha
 * sanaladi (faqat A1 emas).
 *
 * Ishga tushirish: `railway run npx ts-node --transpile-only scripts/daf-jang-audio-uzunligi.ts`
 * (prod R2 manzili kerak). Natija repoga commit qilinadi.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { run } from './lib/check-cli';

const CHEGARA_MS = 3000;

function faylUzunligi(url: string): number | null {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        url,
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    const s = Number(out.trim());
    return Number.isFinite(s) ? Math.round(s * 1000) : null;
  } catch {
    return null;
  }
}

void run(async (prisma) => {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base) throw new Error("R2_PUBLIC_URL yo'q");
  // Kalit ishlatilishi: servisdagi `COUNT(*) OVER (PARTITION BY audioKey)`
  // bilan bir xil to'plam — sectionId bor barcha so'zlar.
  const kalitlar = await prisma.dafLexeme.findMany({
    where: { sectionId: { not: null }, audioKey: { not: null } },
    select: { audioKey: true },
  });
  const kalitSoni = new Map<string, number>();
  for (const k of kalitlar) {
    kalitSoni.set(k.audioKey!, (kalitSoni.get(k.audioKey!) ?? 0) + 1);
  }
  const sozlar = await prisma.dafLexeme.findMany({
    where: { audioKey: { not: null }, unit: { level: 'A1', retiredAt: null } },
    select: {
      sourceId: true,
      audioKey: true,
      audioStartMs: true,
      audioEndMs: true,
      sectionId: true,
    },
    orderBy: { sourceId: 'asc' },
  });
  const natija: Record<string, number> = {};
  let uzun = 0;
  let umumiy = 0;
  for (const s of sozlar) {
    const oraliqBor = s.audioStartMs != null && s.audioEndMs != null;
    // Oraliqsiz: faqat audioKey yagona so'zniki bo'lsa o'z fayli. Bir nechtaga
    // umumiy (yoki sanalmagan — sectionId yo'q) bo'lsa, o'ynamaydi: o'lchamaymiz.
    if (
      !oraliqBor &&
      (s.sectionId == null || kalitSoni.get(s.audioKey!) !== 1)
    ) {
      umumiy += 1;
      continue;
    }
    const ms = oraliqBor
      ? s.audioEndMs! - s.audioStartMs!
      : faylUzunligi(`${base}/${s.audioKey}`);
    if (ms != null && ms > 0 && ms <= CHEGARA_MS) natija[s.sourceId] = ms;
    else uzun += 1;
  }
  const dir = join(__dirname, '..', 'content', 'daf', 'jang');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'eshitish-uzunligi.json'),
    JSON.stringify(natija, null, 2) + '\n',
  );
  console.log(
    `Jami ${sozlar.length}; ≤${CHEGARA_MS} ms: ${Object.keys(natija).length}; tashlandi: ${uzun}; umumiy oraliqsiz fayl: ${umumiy}`,
  );
});
