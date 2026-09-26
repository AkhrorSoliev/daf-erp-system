/**
 * Makes the pronunciation audio of one unit's words and uploads it to R2.
 *
 *   npm run daf:gen-audio -- --unit 3 --stimme Johanna --speed 0.85
 *   npm run daf:gen-audio -- --unit 1 --stimme Johanna --speed 0.85 --ersetzen
 *
 * THE VOICE IS A CEO DECISION (2026-09-25): every course word is spoken by
 * ONE German voice, Inworld TTS "Johanna (de)", and voices are never mixed.
 * Two multilingual voices before it (ElevenLabs Rachel, then Gemini Erinome)
 * read German words that are also English words (Name, Land, wer) with
 * English sounds: one word alone tells a multilingual model nothing about
 * its language. The CEO heard 33 such words in Johanna and approved her.
 * `--stimme` therefore accepts that one voice only (`RUXSAT_ETILGAN_STIMMELAR`);
 * a typo or an old voice stops before anything is sent to fal.ai.
 *
 * `--speed` is required with no default: Inworld has no speed setting, so
 * the clip is slowed locally with ffmpeg (`audio-tempo.ts`), and the course
 * speaks at 0.85. A default would silently undo that choice.
 *
 * `--ersetzen` regenerates words that already have audio and replaces their
 * keys. Without it a rerun skips them, costs nothing and changes nothing.
 * The old files stay in R2: production keeps playing them until its database
 * is seeded with the new manifest, so deleting them here would break the
 * live course.
 *
 * A content-checker refusal (`FalAblehnungError`) is asked again, then with a
 * full stop (`sprichMitAblehnungsschutz`). A word that still has no audio is
 * reported and, with `--ersetzen`, loses its old key, so no word is left in
 * a replaced voice. A run without `--ersetzen` makes only the words that
 * have no audio, which is how such words are retried.
 *
 * PAID: fal.ai calls and R2 writes. `main()` only runs when the file is
 * executed directly (`require.main === module`), so the tests can import it
 * without any network call.
 *
 * Keys are random (`schluesselFuerWort`): the audio IS the answer in the
 * listening exercises, and a key derived from the word would give it away
 * in the URL. A key reaches the manifest only after its upload succeeded.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import {
  FalAblehnungError,
  FalClient,
  OVOZ_TEZLIGI_MAX,
  OVOZ_TEZLIGI_MIN,
} from '../src/daf/media/fal-client';
import { verlangsameMp3 } from '../src/daf/media/audio-tempo';
import {
  audioSchluesselFuer,
  neuerAudioSchluessel,
  type AudioManifest,
} from '../src/daf/media/audio-keys';
import type { Wort, WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'audio.json',
);

/** Units of the A1 course map (`kurs.json`): u01 … u12. */
const UNIT_MIN = 1;
const UNIT_MAX = 12;

/** A `--unit` problem, reported before anything is sent to fal.ai. */
export class UnitArgError extends Error {}

/** `--unit` is missing or has no value. */
export class MissingUnitArgError extends UnitArgError {}

/** `--unit` is not a whole number from 1 to 12. */
export class InvalidUnitArgError extends UnitArgError {}

/**
 * Reads `--unit N` as the unit code (`u02`).
 *
 * Required, with no default: the script was written for unit 1 alone, and
 * falling back to it would quietly re-read a finished unit instead of the
 * one the operator meant. Only digits are accepted, so `1.5` or `02a` can
 * never be rounded into some other unit.
 */
export function parseUnitArg(argv: string[]): string {
  const idx = argv.indexOf('--unit');
  const raw = idx === -1 ? undefined : argv[idx + 1];
  if (raw === undefined) {
    throw new MissingUnitArgError('`--unit` MAJBURIY — masalan `--unit 3`.');
  }
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n < UNIT_MIN || n > UNIT_MAX) {
    throw new InvalidUnitArgError(
      `\`--unit\` ${UNIT_MIN} dan ${UNIT_MAX} gacha butun son bo'lishi kerak, "${raw}" emas.`,
    );
  }
  return `u${String(n).padStart(2, '0')}`;
}

/** The chosen unit's word file. */
export function woerterPfad(unit: string): string {
  return join(__dirname, '..', 'content', 'daf', 'a1', unit, 'woerter.json');
}

/**
 * Narx chegarasi (belgi soni). Brifda qat'iy belgilangan — 53 so'z = 278
 * belgi, chegara 400: xato kirish ma'lumotidan (masalan butun boshqa
 * unit tasodifan qo'shilib qolishi) saqlaydi.
 */
export const BELGI_CHEGARASI = 400;

/**
 * Haqiqiy chaqiruv (dry-run emas) uchun kerak bo'ladigan muhit
 * o'zgaruvchilari — `daf-gen-images.ts` dagi bilan bir xil naqsh: hammasi
 * bir joyda tekshiriladi, yarim ishlab keyin yiqilish yo'q.
 */
const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

/**
 * `zuGenerieren`/`sprechtext` uchun minimal shakl. `Wort`ning o'zi emas —
 * bu yerda faqat uchta maydon kerak, va `tts` `null` bo'lishi ham mumkin
 * (spec testlarida ishlatilgan qiymat), `Wort.tts` esa faqat
 * `string | undefined`. Haqiqiy `Wort[]` (JSON'dan o'qilgan) shu tipga
 * strukturaviy mos keladi — ortiqcha maydonlar muammo emas.
 */
export type SprachEintrag = Pick<Wort, 'sourceId' | 'de'> & {
  tts?: string | null;
};

/**
 * Chaqiruvdan OLDIN to'xtatuvchi himoya. Har qanday `fal.ai` so'rovidan
 * OLDIN chaqiriladi — noto'g'ri kirish ma'lumoti pulni sarflab bo'lgandan
 * keyin emas, sarflashdan OLDIN to'xtaydi.
 */
export function pruefeBudget(zeichenzahl: number): void {
  if (zeichenzahl > BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichenzahl} belgi (chegara ${BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/**
 * TTS'ga yuboriladigan matn. Harf va raqamlar uchun kritik: `Z` ni TTS
 * inglizcha o'qiydi, `Zett` esa nemischa — shuning uchun `tts` bor bo'lsa
 * O'SHA ishlatiladi, aks holda `de`ning o'zi.
 */
export function sprechtext(wort: Pick<SprachEintrag, 'de' | 'tts'>): string {
  return wort.tts ?? wort.de;
}

/** Berilgan so'zlar ro'yxatining jami belgi soni (`sprechtext` bo'yicha). */
export function gesamtZeichenzahl(woerter: SprachEintrag[]): number {
  return woerter.reduce((sum, w) => sum + sprechtext(w).length, 0);
}

/**
 * Manifestda ALLAQACHON kaliti bor so'zlarni chiqarib tashlaydi —
 * idempotentlikning yuragi. Qayta yuritish shu funksiya tufayli pul
 * sarflamaydi va mavjud audioni almashtirmaydi.
 *
 * With `ersetzen` (the `--ersetzen` flag) every word is taken: that is how a
 * unit moves to a new voice.
 */
export function zuGenerieren(
  woerter: SprachEintrag[],
  manifest: AudioManifest,
  ersetzen = false,
): SprachEintrag[] {
  if (ersetzen) return [...woerter];
  return woerter.filter(
    (w) => audioSchluesselFuer(manifest, w.sourceId) === null,
  );
}

/** Bitta so'zning yuklash natijasi — kalit va muvaffaqiyat belgisi. */
export interface YuklashNatijasi {
  sourceId: string;
  key: string;
  ok: boolean;
}

/**
 * Manifestni FAQAT muvaffaqiyatli yuklangan kalitlar bilan yangilaydi.
 * `ok: false` bo'lgan yozuv manifestga hech qachon tushmaydi — aks holda
 * u R2'da yo'q faylga ishora qilardi va o'quvchi yangramaydigan tugmani
 * ko'rardi.
 *
 * With `ersetzen`, a word whose new audio failed also loses its OLD key.
 * Keeping it would leave that one word in the voice being replaced, which
 * is the mix the CEO ruled out; a word without audio just skips the
 * listening formats until it is made.
 */
export function manifestAktualisieren(
  manifest: AudioManifest,
  natijalar: YuklashNatijasi[],
  ersetzen = false,
): AudioManifest {
  const yangi: AudioManifest = { ...manifest };
  for (const n of natijalar) {
    if (n.ok) yangi[n.sourceId] = n.key;
    else if (ersetzen) delete yangi[n.sourceId];
  }
  return yangi;
}

/**
 * Bitta so'z uchun R2 kalitini yasaydi. Kod-ko'rikda topilgan bo'shliq:
 * ilgari `main()` ichida to'g'ridan-to'g'ri `neuerAudioSchluessel()`
 * chaqirilardi — kalit bilan so'zning HAQIQIY TO'QNASHUV nuqtasi hech
 * qanday testda yo'q edi (`manifestAktualisieren`ning o'zi tayyor
 * kalitni faqat KO'CHIRADI, YASAMAYDI, va `neuerAudioSchluessel()`ning
 * o'zi argument olmagani uchun so'zni HATTO KO'RA OLMAYDI). Bu funksiya
 * shu nuqtani mustaqil, testlanadigan joyga chiqaradi: `main()` HAR
 * so'z uchun aynan shuni chaqiradi, va xavfsizlik tripwire testi ham
 * aynan shu funksiya ustida yuritiladi.
 *
 * `wort` parametri ATAYLAB e'tiborsiz qoldiriladi — funksiya faqat
 * `neuerAudioSchluessel()`ga ishonadi. Agar kimdir buni "optimallashtirib"
 * kalitni `wort.de`/`wort.sourceId`dan (yoki ularning xeshidan) hisoblab
 * chiqarsa, tripwire testi buni ushlaydi.
 */
export function schluesselFuerWort(wort: SprachEintrag): string {
  void wort;
  return neuerAudioSchluessel();
}

/**
 * The voices this script may speak course words in: exactly one, the voice
 * the CEO chose on 2026-09-25 (Inworld TTS "Johanna (de)"), so that no unit
 * is ever made in a second voice.
 *
 * WHY A HARD LIST: a value outside it (a typo, or an old voice such as
 * `Rachel` or `Erinome`) would reach fal.ai, where it is either refused or,
 * worse, quietly replaced by a default voice and billed. It is compared
 * here, before anything is sent. Changing the course voice means changing
 * this list AND regenerating every unit with `--ersetzen`.
 */
export const RUXSAT_ETILGAN_STIMMELAR: readonly string[] = ['Johanna'];

/** The Inworld voice id behind each allowed `--stimme` value. */
const INWORLD_STIMMEN: Readonly<Record<string, string>> = {
  Johanna: 'Johanna (de)',
};

/** `--stimme`/`--speed` bayroqlari bilan bog'liq xatolarning umumiy ota klassi. */
export class StimmeArgError extends Error {}

/** `--stimme` bayrog'i yo'q yoki qiymatsiz bo'lsa tashlanadi. */
export class MissingStimmeArgError extends StimmeArgError {}

/** `--stimme` qiymati `RUXSAT_ETILGAN_STIMMELAR`da yo'q bo'lsa tashlanadi. */
export class UnknownStimmeArgError extends StimmeArgError {}

/** `--speed` berilmasa tashlanadi. */
export class MissingSpeedArgError extends StimmeArgError {}

/** `--speed` qiymati son emas bo'lsa tashlanadi. */
export class InvalidSpeedArgError extends StimmeArgError {}

/** `--speed` `OVOZ_TEZLIGI_MIN`–`OVOZ_TEZLIGI_MAX` oralig'idan tashqarida bo'lsa tashlanadi. */
export class SpeedOutOfRangeArgError extends StimmeArgError {}

/** The voice, and the tempo the clips are slowed to. */
export interface GenAudioArgs {
  stimme: string;
  speed: number;
}

/**
 * Reads `--stimme` and `--speed`. Both are required and neither has a
 * default: a default voice could drift from the CEO's choice, and a default
 * tempo would silently undo the slow speed (0.85) the CEO chose. The tempo
 * range is the one the earlier voice used (0.7–1.2), which keeps a typo
 * such as `8.5` from producing a clip nobody can follow.
 */
export function parseGenAudioArgs(argv: string[]): GenAudioArgs {
  const stimmeIdx = argv.indexOf('--stimme');
  const stimmeValue = stimmeIdx === -1 ? undefined : argv[stimmeIdx + 1];
  if (!stimmeValue) {
    throw new MissingStimmeArgError(
      '`--stimme` MAJBURIY — CEO tanlagan ovoz: `--stimme Johanna`.',
    );
  }
  if (!RUXSAT_ETILGAN_STIMMELAR.includes(stimmeValue)) {
    throw new UnknownStimmeArgError(
      `Noma'lum ovoz: "${stimmeValue}". Ruxsat etilgan qiymatlar: ${RUXSAT_ETILGAN_STIMMELAR.join(', ')}. ` +
        "Kurs so'zlari faqat bitta ovozda (CEO qarori, 2026-09-25).",
    );
  }

  const speedIdx = argv.indexOf('--speed');
  const speedRaw = speedIdx === -1 ? undefined : argv[speedIdx + 1];
  if (speedRaw === undefined) {
    throw new MissingSpeedArgError(
      "`--speed` MAJBURIY — kurs sekin gapiradi (`--speed 0.85`), standart qiymat yo'q.",
    );
  }
  const speed = Number(speedRaw);
  if (!Number.isFinite(speed)) {
    throw new InvalidSpeedArgError(
      `\`--speed\` son bo'lishi kerak, "${speedRaw}" emas.`,
    );
  }
  if (speed < OVOZ_TEZLIGI_MIN || speed > OVOZ_TEZLIGI_MAX) {
    throw new SpeedOutOfRangeArgError(
      `\`--speed\` ${OVOZ_TEZLIGI_MIN}–${OVOZ_TEZLIGI_MAX} oralig'ida bo'lishi kerak, ${speed} emas.`,
    );
  }

  return { stimme: stimmeValue, speed };
}

/** `--ersetzen`: regenerate words that already have audio (a voice change). */
export function parseErsetzenArg(argv: string[]): boolean {
  return argv.includes('--ersetzen');
}

/** Identical requests before the text is changed at all. */
export const GLEICHER_TEXT_VERSUCHE = 3;
/** Requests with a full stop added, after the bare word kept being refused. */
export const MIT_PUNKT_VERSUCHE = 2;

/**
 * Speaks `text`, asking again when the content checker refuses it.
 *
 * Refusals were random with Gemini: "zwischen" was refused once and accepted
 * on the next identical request, so the bare word is tried three times
 * first. "dann" was refused three times; a full stop is the smallest change
 * that still makes the audio say only the word. Inworld refused none of 33
 * words in its test, so this is a safety net there. Any other error is
 * thrown at once, because asking again cannot fix a wrong request.
 */
export async function sprichMitAblehnungsschutz(
  sprich: (text: string) => Promise<string>,
  text: string,
): Promise<{ url: string; gesprochen: string; versuche: number }> {
  const mitPunkt = text.endsWith('.') ? text : `${text}.`;
  const plan = [
    ...Array<string>(GLEICHER_TEXT_VERSUCHE).fill(text),
    ...Array<string>(MIT_PUNKT_VERSUCHE).fill(mitPunkt),
  ];
  let letzte: FalAblehnungError | undefined;
  for (let i = 0; i < plan.length; i++) {
    try {
      const url = await sprich(plan[i]);
      return { url, gesprochen: plan[i], versuche: i + 1 };
    } catch (err) {
      if (!(err instanceof FalAblehnungError)) throw err;
      letzte = err;
    }
  }
  throw letzte ?? new FalAblehnungError(`"${text}" rad etildi`);
}

function manifestOquv(): AudioManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
}

async function main() {
  let args: GenAudioArgs;
  let unit: string;
  try {
    args = parseGenAudioArgs(process.argv.slice(2));
    unit = parseUnitArg(process.argv.slice(2));
  } catch (err) {
    if (err instanceof StimmeArgError || err instanceof UnitArgError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  const ersetzen = parseErsetzenArg(process.argv.slice(2));

  const woerterPath = woerterPfad(unit);
  if (!existsSync(woerterPath)) {
    console.error(`${unit}: woerter.json yo'q — avval unit matnini yozing.`);
    process.exitCode = 1;
    return;
  }
  const dataset: WoerterFile = JSON.parse(readFileSync(woerterPath, 'utf8'));
  const manifest = manifestOquv();

  const qoldi = zuGenerieren(dataset.woerter, manifest, ersetzen);
  console.log(
    ersetzen
      ? `${dataset.unit}: ${qoldi.length} so'zning hammasi qayta yasaladi (--ersetzen).`
      : `${dataset.unit}: ${dataset.woerter.length} so'zdan ${qoldi.length} tasiga audio kerak ` +
          `(${dataset.woerter.length - qoldi.length} tasi manifestda allaqachon bor).`,
  );

  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q — hammasida allaqachon audio bor.");
    return;
  }

  // Budjet — birinchi `fal.ai` so'rovidan OLDIN, FAL_KEY tekshiruvidan
  // ham OLDIN: noto'g'ri kirish ma'lumoti pul sarflashdan oldin to'xtashi
  // kerak, muhit sozlanmagani aniqlangandan keyin emas.
  const gesamt = gesamtZeichenzahl(qoldi);
  console.log(`Jami belgi soni: ${gesamt} (chegara ${BELGI_CHEGARASI}).`);
  try {
    pruefeBudget(gesamt);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}.\n` +
        "Ovoz generatsiyasi TO'XTATILDI — hech narsa chaqirilmadi, hech narsa yozilmadi.",
    );
    process.exitCode = 1;
    return;
  }

  const fal = new FalClient(process.env.FAL_KEY!);
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  // One word at a time: speak it, slow it, upload the slowed bytes. A word
  // that fails is recorded and the run goes on, so the words already paid
  // for still reach the manifest.
  const natijalar: YuklashNatijasi[] = [];
  const mitPunkt: string[] = [];
  const stimmeId = INWORLD_STIMMEN[args.stimme];
  let done = 0;
  for (const wort of qoldi) {
    done++;
    const text = sprechtext(wort);
    // Kalit `schluesselFuerWort` orqali yasaladi — bu funksiya so'zni
    // OLADI, lekin ATAYLAB e'tiborsiz qoldiradi (izohiga qarang). Shu
    // yagona chaqiruv nuqtasi tripwire testida ham ishlatiladi.
    const key = schluesselFuerWort(wort);
    try {
      const gesagt = await sprichMitAblehnungsschutz(
        (t) => fal.speechInworld(t, stimmeId),
        text,
      );
      const res = await fetch(gesagt.url);
      if (!res.ok) {
        throw new Error(`audio yuklab olinmadi (HTTP ${res.status})`);
      }
      const roh = Buffer.from(await res.arrayBuffer());
      const sekin = await verlangsameMp3(roh, args.speed);
      await uploader.uploadBytes(key, sekin);
      natijalar.push({ sourceId: wort.sourceId, key, ok: true });
      if (gesagt.gesprochen !== text) {
        mitPunkt.push(`${wort.de} → "${gesagt.gesprochen}"`);
      }
      const qayta =
        gesagt.versuche > 1 ? ` (${gesagt.versuche}-urinishda)` : '';
      console.log(
        `  ${done}/${qoldi.length}: ${wort.de} → "${gesagt.gesprochen}"${qayta}`,
      );
    } catch (err) {
      natijalar.push({ sourceId: wort.sourceId, key, ok: false });
      console.error(
        `  ${done}/${qoldi.length}: ${wort.de} (${wort.sourceId}) YASALMADI: ${(err as Error).message}`,
      );
    }
  }

  const yangiManifest = manifestAktualisieren(manifest, natijalar, ersetzen);
  writeFileSync(MANIFEST_PATH, JSON.stringify(yangiManifest, null, 2) + '\n');
  console.log(`\nManifest yangilandi: ${MANIFEST_PATH}`);

  if (mitPunkt.length > 0) {
    console.log(
      `\nNuqta qo'shib yasalgan so'zlar (quloq bilan tekshiring): ${mitPunkt.join(', ')}`,
    );
  }
  const muvaffaqiyatsiz = natijalar.filter((n) => !n.ok);
  if (muvaffaqiyatsiz.length > 0) {
    console.error(
      `\nDIQQAT: ${muvaffaqiyatsiz.length} ta so'zga audio yasalmadi` +
        (ersetzen ? ', eski kaliti ham manifestdan olindi:' : ':'),
    );
    for (const n of muvaffaqiyatsiz) console.error(`  - ${n.sourceId}`);
    process.exitCode = 1;
  }

  console.log(
    `\n${natijalar.length - muvaffaqiyatsiz.length}/${natijalar.length} ta so'z audiosi muvaffaqiyatli yuklandi.`,
  );
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda yuguradi — bu skript
// PULLIK (fal.ai ovoz generatsiyasi + R2 yuklash).
// Testlar bu faylni import qilganda `require.main !== module`, shuning
// uchun hech qanday tarmoq so'rovi test paytida ishga tushmaydi
// (`daf-voice-samples.ts`/`daf-gen-images.ts` dagi bilan bir xil naqsh).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
