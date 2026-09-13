import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Dialog audiosining boshi/oxiridagi jimlik miqdori (Task 11e).
 *
 * Egasi 12 tayyor suhbatni eshitib topdi: `ffmpeg silencedetect` bo'yicha
 * nutq faylning 0.09–0.12 s ida boshlanardi, ba'zilarida oxirgi bo'g'in
 * bilan tugab, jimlik 0 s edi. O'quvchi «Play» bosishi bilan birinchi
 * so'z yo'qolar, oxiri esa kesilgandek eshitilardi.
 *
 * DIQQAT — bu qiymatlarni o'zgartirish ESKI (allaqachon shu qiymatlar
 * bilan ishlangan) fayllarni AVTOMATIK qayta ishlamaydi. R2'da faqat
 * PADDED audio saqlanadi, xom (jimliksiz) asl nusxa yo'q — shuning uchun
 * `daf-polster-dialog-audio.ts`dagi `zuPolsterndeEintraege` boshqa
 * `polster` bilan belgilangan yozuvni qayta yuklab ustiga yana bir bor
 * jimlik qo'shish o'rniga XATO bilan TO'XTAYDI. Qiymat o'zgarganda eski
 * yozuvlarni to'g'ri yangilash uchun fal.ai orqali QAYTA YOZISH kerak.
 */
export const POLSTER = { vorneMs: 700, hintenMs: 1000 } as const;

/**
 * Manifestga yoziladigan belgi — qayta ishlashdan himoya
 * (`daf-polster-dialog-audio.ts`). `POLSTER`dan hosil qilinadi, qo'lda
 * takrorlanmaydi: qiymat o'zgarsa ikkalasi birga o'zgaradi.
 */
export const POLSTER_KENNUNG = `${POLSTER.vorneMs}/${POLSTER.hintenMs}`;

/**
 * ffmpeg argumentlarini quradi — SOF funksiya, hech narsani yuritmaydi.
 *
 * `adelay=700:all=1` — boshiga 700 ms jimlik (`all=1` HAMMA kanalga
 * qo'llanadi; aks holda stereo faylda faqat bitta kanal kechikib, ikki
 * kanal orasida fazoviy siljish paydo bo'lardi). `apad=pad_dur=1` —
 * oxiriga 1 s (=`POLSTER.hintenMs / 1000`) jimlik.
 */
export function polsterFfmpegArgs(eingabe: string, ausgabe: string): string[] {
  return [
    '-i',
    eingabe,
    '-af',
    `adelay=${POLSTER.vorneMs}:all=1,apad=pad_dur=${POLSTER.hintenMs / 1000}`,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    '-y',
    ausgabe,
  ];
}

/**
 * MP3 baytlariga boshi/oxiriga jimlik qo'shadi.
 *
 * ffmpeg xotiradagi buferni emas, faqat fayl yo'lini o'qiy oladi —
 * shuning uchun vaqtinchalik papka orqali ishlaydi. `finally` bloki
 * papkani HAR doim o'chiradi (muvaffaqiyat yoki xato — farqi yo'q), aks
 * holda har chaqiruv diskda chiqindi qoldirardi.
 *
 * ffmpeg topilmasa (`ENOENT`) yoki xato bilan tugasa — ANIQ xabar bilan
 * xato TASHLANADI. Jimgina asl baytlarni qaytarish NOTO'G'RI bo'lardi:
 * chaqiruvchi (generatsiya va polster skriptlari) muvaffaqiyatni
 * "jimlik qo'shildi" degan ma'noda qabul qiladi — jim muvaffaqiyatsizlik
 * jimliksiz faylni "tayyor" deb belgilab qo'yardi.
 */
export async function polstereMp3(eingabe: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'daf-polster-'));
  const kirishYoli = join(dir, 'kirish.mp3');
  const chiqishYoli = join(dir, 'chiqish.mp3');
  try {
    await writeFile(kirishYoli, eingabe);
    try {
      await execFileAsync('ffmpeg', polsterFfmpegArgs(kirishYoli, chiqishYoli));
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      const tafsilot = e.stderr?.trim() || e.message;
      throw new Error(`ffmpeg jimlik qo'sha olmadi: ${tafsilot}`);
    }
    return await readFile(chiqishYoli);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
