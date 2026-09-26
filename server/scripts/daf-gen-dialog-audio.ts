/**
 * Dialoglarga ovoz yasaydi va R2 ga yuklaydi.
 *
 *   npm run daf:gen-dialog-audio -- --dialog u02-d2     — bitta (namuna darvozasi)
 *   npm run daf:gen-dialog-audio -- --unit 2            — unitning hammasi
 *   npm run daf:gen-dialog-audio -- --unit 1 --unit 2   — bir nechta unit
 *
 * Model: Gemini 3.1 Flash TTS in dialogue mode (`FalClient.dialogGemini`).
 * The CEO chose it for every course dialog on 2026-09-26, after hearing an
 * emotional sample and an A2 interview made this way; before that the
 * dialogs were ElevenLabs. Every speaker is voiced in one request, so the
 * turns answer each other. Single words stay with Inworld (`daf-gen-audio`).
 *
 * Voices come from `stimmen.json` (character → Gemini voice); a character
 * keeps one voice for the whole course and there is no default voice.
 * Delivery comes from `dialog-regie.json`: one short German scene per
 * dialog, and one optional English tone tag per line ("[curious]"). The
 * model reads tags and scene as directions, not as text; the offline
 * whisper check confirms that no tag was spoken.
 *
 * PULLIK: $0.05 / 1 000 belgi (2026-09-26), counted over the prompt AND the
 * style instructions. Manifestda xeshi va modeli mos dialog QAYTA
 * yasalmaydi — qayta yuritish pul sarflamaydi. Matni tahrirlangan yoki
 * boshqa modelda yasalgan dialog qayta yasaladi va eski kalit almashadi
 * (eski R2 fayli o'chirilmaydi: prod uni seedgacha o'ynaydi).
 *
 * `main()` faqat fayl to'g'ridan-to'g'ri ishga tushirilganda yuguradi
 * (`require.main === module`) — testlar import qilganda tarmoq yo'q.
 *
 * Pul xavfsizligi (2026-09-12 ko'rikda topilgan, shu faylda tuzatilgan):
 *
 * 1. Takroriy `--unit`/`--dialog` bayrog'i (masalan `--unit 2 --unit 2`)
 *    bitta martalik tanlovga tushadi (`parseAuswahl`) — aks holda bitta
 *    unit ikki marta yuklanib, ichidagi har bir dialog ikki marta PULLIK
 *    generatsiya qilinardi. Ikkinchi qatlam sifatida yuklangan
 *    ro'yxatning O'ZIDA ham bir xil `id` faqat BIR marta ishlanadi
 *    (`zuGenerierenDialoge` ichida) — hech qanday kirish shakli bitta
 *    dialogni ikki marta to'lamasin.
 * 2. Har dialog BITTALAB ishlanadi (`generiereDialogeNacheinander`):
 *    yasaladi → R2'ga yuklanadi → DARHOL manifestga yoziladi va fayl
 *    saqlanadi, keyingisiga o'tishdan OLDIN. N-dialog yiqilsa faqat O'SHA
 *    dialog "havoda qoladi"; 1..N-1 allaqachon manifestda, xesh va model
 *    tekshiruvi ularni qayta yasashdan saqlaydi.
 * 3. Every request is built and checked (voices, scene, tags, budget)
 *    before the first paid call, so a content mistake stops the run while
 *    it has cost nothing.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import {
  FalAblehnungError,
  FalClient,
  type GeminiDialog,
} from '../src/daf/media/fal-client';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import { polstereMp3, POLSTER_KENNUNG } from '../src/daf/media/audio-polster';
import {
  DIALOG_AUDIO_MODELL,
  dialogTextHash,
  type DialogAudioManifest,
} from '../src/daf/inhalt/dialog-audio';
import type { Dialog, DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const MANIFEST_PATH = join(A1, 'dialog-audio.json');
const STIMMEN_PATH = join(A1, 'stimmen.json');
const REGIE_PATH = join(A1, 'dialog-regie.json');

/** Gemini 3.1 Flash TTS price on fal, 2026-09-26. */
export const NARX_1000_BELGI = 0.05;

/**
 * Bir yuritishdagi belgi chegarasi. Units 1–3 (18 dialogs) come to 6 400
 * characters ($0.32); the limit is the CEO-approved $0.36 for that run, so an
 * extra unit swept in by mistake stops the run instead of being paid for.
 */
export const BELGI_CHEGARASI_DIALOG = 7200;

/** Appended to every scene: A1 learners need clear speech at a calm pace. */
export const DIALOG_STIL_ZUSATZ = 'Deutlich, in ruhigem Tempo.';

/**
 * A content-checker refusal costs nothing and passes when the same request
 * is sent again (2026-09-25), so it is retried; no other error is.
 */
export const ABLEHNUNG_VERSUCHE = 3;

const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

export type Stimmen = Record<string, string>;

/** `dialog-regie.json`: per dialog a German scene and one tone per line. */
export type DialogRegie = Record<
  string,
  { szene: string; toene: Array<string | null> }
>;

// A tone becomes "[tone]" in the prompt: plain lowercase English words, so
// no German word and no bracket can end up read aloud.
const TON = /^[a-z]+( [a-z]+)*$/;
// fal's rule for a speaker alias, which is also the line prefix.
const SPRECHER_ID = /^\w+$/;

/**
 * Builds the Gemini request for one dialog and checks it first: every
 * speaker has a voice, the speakers sound different, and the scene and
 * tones exist and line up with the text.
 */
export function geminiDialog(
  dialog: Dialog,
  stimmen: Stimmen,
  regie: DialogRegie,
): GeminiDialog {
  const sprecher: string[] = [];
  for (const z of dialog.zeilen) {
    if (!sprecher.includes(z.sprecher)) sprecher.push(z.sprecher);
  }
  if (sprecher.length < 2) {
    throw new Error(
      `${dialog.id}: suhbat rejimiga kamida 2 ta gapiruvchi kerak, bu dialogda ${sprecher.length} ta.`,
    );
  }
  for (const s of sprecher) {
    if (!SPRECHER_ID.test(s)) {
      throw new Error(
        `${dialog.id}: «${s}» nomi gap boshida belgi bo'la olmaydi (faqat harf va raqam, bo'shliqsiz).`,
      );
    }
    if (!stimmen[s]) {
      throw new Error(
        `${dialog.id}: «${s}» uchun ovoz yo'q — stimmen.json ga qo'shing. ` +
          "Standart ovoz ATAYLAB yo'q: obraz ovozi kurs davomida o'zgarmaydi.",
      );
    }
  }
  for (let i = 0; i < sprecher.length; i++) {
    for (let j = i + 1; j < sprecher.length; j++) {
      if (stimmen[sprecher[i]] === stimmen[sprecher[j]]) {
        throw new Error(
          `${dialog.id}: «${sprecher[i]}» va «${sprecher[j]}» bir xil ovozda (${stimmen[sprecher[i]]}) — ` +
            'tinglovchi ularni ajrata olmaydi. stimmen.json da biriga boshqa ovoz bering.',
        );
      }
    }
  }

  const r = regie[dialog.id];
  if (!r) {
    throw new Error(
      `${dialog.id}: sahna ko'rsatmasi yo'q — dialog-regie.json ga qo'shing.`,
    );
  }
  if (r.toene.length !== dialog.zeilen.length) {
    throw new Error(
      `${dialog.id}: dialogda ${dialog.zeilen.length} satr, dialog-regie.json da ${r.toene.length} ta ohang.`,
    );
  }
  for (const ton of r.toene) {
    if (ton !== null && !TON.test(ton)) {
      throw new Error(
        `${dialog.id}: «${ton}» ohang (ton) bo'la olmaydi — faqat kichik harfli inglizcha so'zlar.`,
      );
    }
  }

  const prompt = dialog.zeilen
    .map((z, i) => {
      const ton = r.toene[i];
      return `${z.sprecher}: ${ton ? `[${ton}] ` : ''}${z.tts ?? z.de}`;
    })
    .join('\n');
  return {
    prompt,
    speakers: sprecher.map((s) => ({ speakerId: s, voice: stimmen[s] })),
    styleInstructions: `${r.szene} ${DIALOG_STIL_ZUSATZ}`,
  };
}

/**
 * Manifestda xeshi VA modeli mos dialoglar o'tkazib yuboriladi —
 * idempotentlik. A dialog voiced by another model (an entry from before
 * the switch has no `modell`) is remade: the course must not mix models.
 *
 * Ikkinchi qatlam (2026-09-12 ko'rik, F1): ro'yxatda bir xil `id` IKKI
 * marta kelib qolsa faqat BIRINCHISI qoladi — hech qanday kirish shakli
 * bitta dialogni ikki marta PULLIK generatsiya qildirmasin.
 */
export function zuGenerierenDialoge(
  dialoge: Dialog[],
  manifest: DialogAudioManifest,
): Dialog[] {
  const korilganIdlar = new Set<string>();
  const natija: Dialog[] = [];
  for (const d of dialoge) {
    if (korilganIdlar.has(d.id)) continue;
    korilganIdlar.add(d.id);
    const eintrag = manifest[d.id];
    if (
      eintrag?.textHash !== dialogTextHash(d.zeilen) ||
      eintrag.modell !== DIALOG_AUDIO_MODELL
    ) {
      natija.push(d);
    }
  }
  return natija;
}

/** Billed characters: the prompt and the style instructions. */
export function gesamtZeichenDialoge(anfragen: GeminiDialog[]): number {
  return anfragen.reduce(
    (sum, a) => sum + a.prompt.length + a.styleInstructions.length,
    0,
  );
}

export function pruefeDialogBudget(zeichen: number): void {
  if (zeichen > BELGI_CHEGARASI_DIALOG) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichen} belgi (chegara ${BELGI_CHEGARASI_DIALOG}). ` +
        "Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.",
    );
  }
}

function argValues(argv: string[], flag: string): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
  });
  return out;
}

export interface Auswahl {
  units: string[];
  dialoge: string[];
}

/**
 * `--unit`/`--dialog` bayroqlaridan tanlovni o'qiydi — DUBLIKATSIZ.
 *
 * F1 (2026-09-12 ko'rik): ilgari takroriy bayroq (masalan
 * `--unit 2 --unit 2`) BIR XIL faylni IKKI marta yuklardi va har bir
 * dialog PULLIK ravishda IKKI marta generatsiya qilinardi. Shuning uchun
 * `units` HAM, `dialoge` HAM `Set` orqali dublikatsizlanadi.
 */
export function parseAuswahl(argv: string[]): Auswahl {
  const units = Array.from(
    new Set(
      argValues(argv, '--unit').map(
        (n) => `u${String(Number(n)).padStart(2, '0')}`,
      ),
    ),
  );
  const dialoge = Array.from(new Set(argValues(argv, '--dialog')));
  if (units.length === 0 && dialoge.length === 0) {
    throw new Error('Kerak: --unit <raqam> yoki --dialog <kod>');
  }
  for (const code of dialoge) {
    const unit = code.slice(0, 3);
    if (!units.includes(unit)) units.push(unit);
  }
  return { units, dialoge };
}

function ladeDialoge(): Dialog[] {
  const { units, dialoge: einzeln } = parseAuswahl(process.argv);
  const alle = units.flatMap(
    (u) =>
      (
        JSON.parse(
          readFileSync(join(A1, u, 'dialoge.json'), 'utf8'),
        ) as DialogeFile
      ).dialoge,
  );
  return einzeln.length > 0 ? alle.filter((d) => einzeln.includes(d.id)) : alle;
}

export type DialogGenerierFn = (
  dialog: Dialog,
  anfrage: GeminiDialog,
) => Promise<{ key: string; polster?: string }>;

/**
 * Dialoglarni BIRIN-KETIN ishlaydi (2026-09-12 ko'rik, F2): har biri
 * `generiere` bilan yasaladi/yuklanadi, DARHOL manifestga (modeli bilan)
 * yoziladi va `speichereManifest` bilan diskka saqlanadi — keyingisiga
 * o'tishdan OLDIN. N-dialog yiqilsa xato tashqariga uloqtiriladi va sikl
 * TO'XTAYDI, lekin 1..N-1 allaqachon manifestda VA diskda saqlangan —
 * pul yo'qolmaydi, qayta yuritish faqat to'xtagan joydan davom etadi.
 *
 * `manifest` argument sifatida MUTATSIYA qilinadi (nusxa emas) — xato
 * tashlangandan keyin ham chaqiruvchi yozilgan yozuvlarni ko'ra oladi.
 */
export async function generiereDialogeNacheinander(
  dialoge: Dialog[],
  anfrageById: Map<string, GeminiDialog>,
  manifest: DialogAudioManifest,
  generiere: DialogGenerierFn,
  speichereManifest: (manifest: DialogAudioManifest) => void,
): Promise<void> {
  for (const d of dialoge) {
    let result: { key: string; polster?: string };
    try {
      result = await generiere(d, anfrageById.get(d.id)!);
    } catch (err) {
      throw new Error(
        `"${d.titelDe}" (${d.id}) yasalmadi/yuklanmadi: ${(err as Error).message}`,
      );
    }
    manifest[d.id] = {
      key: result.key,
      textHash: dialogTextHash(d.zeilen),
      ...(result.polster ? { polster: result.polster } : {}),
      modell: DIALOG_AUDIO_MODELL,
    };
    speichereManifest(manifest);
    console.log(
      `  ${d.id}: ${d.titelDe} → yasaldi, yuklandi, manifestga yozildi`,
    );
  }
}

/**
 * Bitta dialog uchun to'liq quvur: fal.ai orqali yasaydi (rad etilsa
 * shu so'rovni yana yuboradi), baytlarni yuklab oladi, JIMLIK QO'SHADI
 * (`polster`), YANGI tasodifiy kalit bilan R2'ga yuklaydi.
 *
 * Bog'liqliklar (fal, uploader, fetchFn, polster) INJEKTSIYA QILINADI —
 * testlar soxta (network'siz) nusxalar bilan ishlaydi. Kalit har doim
 * YANGI va tasodifiy (`neuerAudioSchluessel()`), demak R2'da hech qachon
 * oldindan mavjud bo'lmaydi.
 */
export function erstelleGeneriere(
  fal: Pick<FalClient, 'dialogGemini'>,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
  fetchFn: typeof fetch,
  polster: (bytes: Buffer) => Promise<Buffer>,
): DialogGenerierFn {
  return async (d, anfrage) => {
    let sourceUrl: string | undefined;
    for (let versuch = 1; sourceUrl === undefined; versuch++) {
      try {
        sourceUrl = await fal.dialogGemini(anfrage);
      } catch (err) {
        if (
          !(err instanceof FalAblehnungError) ||
          versuch >= ABLEHNUNG_VERSUCHE
        ) {
          throw err;
        }
        console.log(
          `    ${d.id}: fal.ai rad etdi (${versuch}-marta), yana so'rayapman`,
        );
      }
    }
    // Pul xavfsizligi: bu yerdan keyin HALI uchta bosqich bor (yuklab
    // olish, jimlik, R2'ga yuklash) — birortasi yiqilsa, ENDIGINA PULLIK
    // yasalgan audio hech qayerga yozilmagan bo'lardi. `sourceUrl`
    // fal.ai'ning VAQTINCHALIK ommaviy manzili (sir emas) — konsolga
    // chiqarilishi qo'lda tiklab olish imkonini beradi.
    console.log(`    ${d.id}: fal.ai natijasi — ${sourceUrl}`);
    const res = await fetchFn(sourceUrl);
    if (!res.ok) {
      throw new Error(`fal.ai audiosi yuklab olinmadi — HTTP ${res.status}`);
    }
    const roh = Buffer.from(await res.arrayBuffer());
    const gepolstert = await polster(roh);
    const key = neuerAudioSchluessel();
    await uploader.uploadBytes(key, gepolstert);
    return { key, polster: POLSTER_KENNUNG };
  };
}

async function main(): Promise<void> {
  const stimmen = JSON.parse(readFileSync(STIMMEN_PATH, 'utf8')) as Stimmen;
  const regie = JSON.parse(readFileSync(REGIE_PATH, 'utf8')) as DialogRegie;
  const manifest: DialogAudioManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DialogAudioManifest)
    : {};

  const qoldi = zuGenerierenDialoge(ladeDialoge(), manifest);
  console.log(`${qoldi.length} ta dialogga ovoz kerak.`);
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }
  // Every request is built and checked BEFORE the network — a missing
  // voice, scene or tone stops the run while nothing has been paid.
  const anfrageById = new Map(
    qoldi.map((d) => [d.id, geminiDialog(d, stimmen, regie)]),
  );

  const zeichen = gesamtZeichenDialoge([...anfrageById.values()]);
  console.log(
    `Jami belgi: ${zeichen} (≈ $${((zeichen / 1000) * NARX_1000_BELGI).toFixed(3)}).`,
  );
  pruefeDialogBudget(zeichen);
  if (process.argv.includes('--dry-run')) {
    console.log('--dry-run: hech narsa yuborilmadi.');
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    throw new Error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}`,
    );
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

  await generiereDialogeNacheinander(
    qoldi,
    anfrageById,
    manifest,
    erstelleGeneriere(fal, uploader, fetch, polstereMp3),
    (m) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n'),
  );
  console.log(
    `Manifest yangilandi: ${MANIFEST_PATH} (${qoldi.length} ta dialog).`,
  );
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    // Butun xatoni (stack bilan) chop etadi — faqat `.message` emas
    // (2026-09-12 ko'rik, F5; `daf-gen-audio.ts` dagi bilan bir xil naqsh).
    console.error(e);
    process.exit(1);
  });
}
