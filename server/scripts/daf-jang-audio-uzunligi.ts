/**
 * Jang eshitish savollari uchun so'z ovozlarining uzunligi (spec §4).
 *
 * Nega DB'dan: `audioStartMs`/`audioEndMs` to'ldirilgan so'z umumiy bo'lim
 * faylining bir bo'lagi — uzunligi oraliqdan olinadi, faylni o'lchash
 * BUTUN bo'limni o'lchaydi. Oraliqsiz so'z — o'z fayli, `ffprobe` o'lchaydi.
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
  const sozlar = await prisma.dafLexeme.findMany({
    where: { audioKey: { not: null }, unit: { level: 'A1', retiredAt: null } },
    select: {
      sourceId: true,
      audioKey: true,
      audioStartMs: true,
      audioEndMs: true,
    },
    orderBy: { sourceId: 'asc' },
  });
  const natija: Record<string, number> = {};
  let uzun = 0;
  for (const s of sozlar) {
    const ms =
      s.audioStartMs != null && s.audioEndMs != null
        ? s.audioEndMs - s.audioStartMs
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
    `Jami ${sozlar.length}; ≤${CHEGARA_MS} ms: ${Object.keys(natija).length}; tashlandi: ${uzun}`,
  );
});
