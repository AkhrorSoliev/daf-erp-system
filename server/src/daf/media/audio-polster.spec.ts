import { execFile, execFileSync } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  POLSTER,
  POLSTER_KENNUNG,
  polsterFfmpegArgs,
  polstereMp3,
} from './audio-polster';

const execFileAsync = promisify(execFile);

describe('POLSTER_KENNUNG', () => {
  it('POLSTER dan hosil qilinadi — qo`lda takrorlanmagan', () => {
    expect(POLSTER_KENNUNG).toBe(`${POLSTER.vorneMs}/${POLSTER.hintenMs}`);
    expect(POLSTER_KENNUNG).toBe('700/1000');
  });
});

describe('polsterFfmpegArgs', () => {
  it('kirish, adelay+apad filtri, kodek, sifat, -y, chiqish tartibida (sof funksiya)', () => {
    expect(polsterFfmpegArgs('/tmp/kirish.mp3', '/tmp/chiqish.mp3')).toEqual([
      '-i',
      '/tmp/kirish.mp3',
      '-af',
      'adelay=700:all=1,apad=pad_dur=1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      '-y',
      '/tmp/chiqish.mp3',
    ]);
  });
});

/**
 * ffmpeg mavjudligi TEST RO'YXATGA OLINGANDA (module yuklanganda) sinchiklab
 * tekshiriladi — `it.skip` shu yerda tanlanadi, testning O'ZI ichida emas.
 * Aks holda ffmpeg yo'q muhitda test "o'tdi" (yashil) bo'lib ko'rinardi,
 * holbuki hech narsa tekshirilmagan bo'lardi.
 */
function ffmpegMavjud(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const FFMPEG_BOR = ffmpegMavjud();
const integrationTest = FFMPEG_BOR ? it : it.skip;

async function sinusYasa(yol: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    '-y',
    yol,
  ]);
}

async function ffprobeDavomiyligi(yol: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    yol,
  ]);
  return Number(stdout.trim());
}

describe('polstereMp3 (integratsiya)', () => {
  integrationTest(
    FFMPEG_BOR
      ? '1 s lik ohangga jimlik qo`shilgach, davomiylik ≈ 2.7 s bo`ladi (ffmpeg mavjud)'
      : "ffmpeg topilmadi — bu muhitda o'tkazib yuborildi",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'daf-polster-test-'));
      try {
        const sinusYoli = join(dir, 'sinus.mp3');
        await sinusYasa(sinusYoli);
        const kirishBaytlar = await readFile(sinusYoli);

        const natija = await polstereMp3(kirishBaytlar);

        const chiqishYoli = join(dir, 'natija.mp3');
        await writeFile(chiqishYoli, natija);
        const davomiylik = await ffprobeDavomiyligi(chiqishYoli);

        expect(davomiylik).toBeGreaterThanOrEqual(2.7 - 0.15);
        expect(davomiylik).toBeLessThanOrEqual(2.7 + 0.15);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );

  // ffmpeg O'ZI yo'q muhitda (CI) `execFileAsync('ffmpeg', ...)` xom
  // spawn `ENOENT` bilan yiqiladi — bu ham `/ffmpeg/i`ga mos keladi,
  // shuning uchun avvalgi versiya ffmpegSIZ ham YASHIL edi, holbuki
  // pastdagi haqiqiy yo'l (ffmpeg BOR-u, kirish yaroqsiz) hech qachon
  // ishlamagan edi. `integrationTest` bilan CI'da o'tkazib yuboriladi,
  // va endi ANIQ wrapper xabari (`audio-polster.ts`dagi
  // "ffmpeg jimlik qo'sha olmadi") tekshiriladi — umumiy `/ffmpeg/i` emas.
  integrationTest(
    FFMPEG_BOR
      ? 'ffmpeg yiqilsa (yaroqsiz MP3), ANIQ xabar bilan xato tashlaydi — asl baytlarni jimgina qaytarmaydi'
      : "ffmpeg topilmadi — bu muhitda o'tkazib yuborildi",
    async () => {
      await expect(polstereMp3(Buffer.from('bu mp3 emas'))).rejects.toThrow(
        "ffmpeg jimlik qo'sha olmadi",
      );
    },
  );
});
