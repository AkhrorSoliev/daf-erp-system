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
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { alignWords, type AudioSegment } from '../src/daf/audio/align';
import { parseSilences, speechSpans, tighten } from '../src/daf/audio/tighten';

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

/**
 * ffmpeg diagnostikani (jimlik ro'yxatini ham) STDERR'ga yozadi, va
 * muvaffaqiyatli tugaydi.
 *
 * Shuning uchun `spawnSync`: `execFileSync` faqat XATO bo'lganda stderr
 * beradi, muvaffaqiyatda esa uni tashlab yuboradi. Birinchi versiya aynan
 * shuni qilgan — jimlik ro'yxati hech qachon kelmagan, chegara
 * toraytirilmagan, va buni hech narsa bildirmagan.
 */
function runCapturingStderr(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.stderr ?? '';
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

/** Whisper bo'laklari — matn va taxminiy chegara. */
function transcribe(wav: string, out: string): AudioSegment[] {
  run('whisper-cli', [
    '-m',
    MODEL,
    '-f',
    wav,
    '-l',
    'de',
    '-oj',
    '-of',
    out,
    '--no-prints',
  ]);
  const json = JSON.parse(readFileSync(`${out}.json`, 'utf8')) as {
    transcription: { offsets: { from: number; to: number }; text: string }[];
  };
  return json.transcription.map((t) => ({
    startMs: t.offsets.from,
    endMs: t.offsets.to,
    text: t.text.trim(),
  }));
}

/** ffmpeg jimlik ro'yxati. */
function silences(wav: string) {
  const stderr = runCapturingStderr('ffmpeg', [
    '-v',
    'info',
    '-i',
    wav,
    '-af',
    'silencedetect=noise=-35dB:d=0.35',
    '-f',
    'null',
    '-',
  ]);
  return parseSilences(stderr);
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
  // Jimliksiz fayl — chegara toraytirilmagani, ya'ni so'z o'ynagach
  // keyingisigacha jimlik davom etadi. Bu xato emas, lekin jim
  // qolmasligi kerak.
  const noSilence: string[] = [];

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

    const sil = silences(wav);
    if (sil.length === 0) noSilence.push(key);
    const spans = speechSpans(sil, durationMs(wav));
    const segments = transcribe(wav, join(WORK, 'a')).map((s) =>
      tighten(s, spans),
    );

    const aligned = alignWords(
      words.map((w) => w.de),
      segments,
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
  if (noSilence.length > 0) {
    console.log(
      `\nJimlik topilmagan fayllar: ${noSilence.length} (chegara Whisper bo'yicha qoldi)`,
    );
  }
  if (weak.length > 0) {
    console.log(`\nTo'liq bo'lmagan fayllar (${weak.length}):`);
    for (const w of weak.slice(0, 20)) console.log(`  ${w}`);
  }

  await prisma.$disconnect();
}

void main();
