/**
 * Lug'at audiosini so'zlarga moslashtiradi.
 *
 *   npm run daf:align-audio
 *   npm run daf:align-audio -- --limit 3     — faqat 3 ta fayl (sinov)
 *
 * Manbada audio BO'LIM darajasida: bitta mp3 o'ntacha so'zni ketma-ket
 * o'qiydi. Bu skript har so'zning fayl ichidagi oralig'ini topadi, shunda
 * so'z tugmasi butun faylni emas, faqat o'sha so'zni o'ynatadi.
 *
 * Ikkita asbob birga ishlaydi: Whisper NIMA aytilganini aytadi, ffmpeg
 * QAYERDA jimlik borligini. Whisper'ning chegarasi keng (bir bo'lak
 * keyingisining boshigacha cho'ziladi), jimlik esa aniq kesadi.
 *
 * Talab: `ffmpeg` va `whisper-cli` (brew install ffmpeg whisper-cpp) hamda
 * GGML model fayli — manzili `WHISPER_MODEL` da.
 *
 * Topilmagan so'z AUDIOSIZ qoladi. Taxminiy oraliq «audio bor» deb
 * ko'rsatib, boshqa so'zni o'ynatardi — va o'quvchi buni xato deb
 * tushunmasdi, shunchaki noto'g'ri o'rganardi.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  alignToStream,
  tokensToWords,
  type Token,
} from '../src/daf/audio/token-align';

const MODEL = process.env.WHISPER_MODEL ?? '';
const WORK = join(tmpdir(), 'daf-align');

function limitArg(): number | null {
  const i = process.argv.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Faylning davomiyligi, millisekundda. */
function durationMs(file: string): number {
  const out = run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  return Math.round(Number(out.trim()) * 1000);
}

/** Whisper uchun 16 kHz mono WAV. */
function toWav(mp3: string, wav: string): void {
  run('ffmpeg', [
    '-v',
    'error',
    '-i',
    mp3,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    wav,
    '-y',
  ]);
}

/**
 * Whisper TOKENLARI — har biri o'z vaqti bilan.
 *
 * `-ojf` (to'liq JSON) token darajasini beradi. Oddiy `-oj` faqat
 * bo'laklarni beradi, va ular ishonchsiz: ot-so'zlar faylida bitta
 * bo'lakka to'qqizta so'z tushadi, natijada 40 fayldan 17 tasida hech
 * narsa topilmagan edi.
 */
function transcribeTokens(wav: string, out: string): Token[] {
  run('whisper-cli', [
    '-m',
    MODEL,
    '-f',
    wav,
    '-l',
    'de',
    '-ojf',
    '-of',
    out,
    '--no-prints',
  ]);
  const json = JSON.parse(readFileSync(`${out}.json`, 'utf8')) as {
    transcription: {
      tokens?: { text: string; offsets: { from: number; to: number } }[];
    }[];
  };
  return json.transcription.flatMap((seg) =>
    (seg.tokens ?? []).map((t) => ({
      text: t.text,
      startMs: t.offsets.from,
      endMs: t.offsets.to,
    })),
  );
}

async function main() {
  if (!MODEL || !existsSync(MODEL)) {
    console.error(
      'WHISPER_MODEL sozlanmagan yoki fayl yo`q.\n' +
        'Model: https://huggingface.co/ggerganov/whisper.cpp (ggml-small.bin)',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  const keys = await prisma.dafLexeme.findMany({
    where: { audioKey: { not: null } },
    distinct: ['audioKey'],
    select: { audioKey: true },
    orderBy: { audioKey: 'asc' },
  });

  const limit = limitArg();
  const files = (limit ? keys.slice(0, limit) : keys).map((k) => k.audioKey!);
  console.log(`${files.length} ta audio fayl\n`);

  mkdirSync(WORK, { recursive: true });
  let matched = 0;
  let unmatched = 0;
  const weak: string[] = [];
  // Nutqi umuman tanilmagan fayl — bu jiddiy, chunki unda hech bir
  // so'z audio olmaydi.
  const noSpeech: string[] = [];

  for (const [i, key] of files.entries()) {
    const words = await prisma.dafLexeme.findMany({
      where: { audioKey: key },
      select: { id: true, de: true },
      orderBy: { order: 'asc' },
    });

    const mp3 = join(WORK, 'a.mp3');
    const wav = join(WORK, 'a.wav');
    run('curl', ['-sSL', '-o', mp3, `${base}/${key}`]);
    toWav(mp3, wav);

    const stream = tokensToWords(transcribeTokens(wav, join(WORK, 'a')));
    if (stream.length === 0) noSpeech.push(key);

    const aligned = alignToStream(
      words.map((w) => w.de),
      stream,
    );

    for (const [j, a] of aligned.entries()) {
      await prisma.dafLexeme.update({
        where: { id: words[j].id },
        data: { audioStartMs: a.startMs, audioEndMs: a.endMs },
      });
      if (a.startMs === null) unmatched++;
      else matched++;
    }

    const miss = aligned.filter((a) => a.startMs === null).length;
    if (miss > 0) weak.push(`${key}: ${miss}/${words.length} topilmadi`);
    console.log(
      `  ${i + 1}/${files.length}  ${key}  ${words.length - miss}/${words.length}`,
    );
  }

  rmSync(WORK, { recursive: true, force: true });

  console.log(`\nTopildi:     ${matched}`);
  console.log(`Topilmadi:   ${unmatched}`);
  if (noSpeech.length > 0) {
    console.log(`\nNutq tanilmagan fayllar: ${noSpeech.length}`);
    for (const k of noSpeech.slice(0, 10)) console.log(`  ${k}`);
  }
  if (weak.length > 0) {
    console.log(`\nTo'liq bo'lmagan fayllar (${weak.length}):`);
    for (const w of weak.slice(0, 20)) console.log(`  ${w}`);
  }

  await prisma.$disconnect();
}

void main();
