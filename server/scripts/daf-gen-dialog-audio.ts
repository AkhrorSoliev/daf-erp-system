/**
 * Dialoglarga ovoz yasaydi (`text-to-dialogue/eleven-v3`) va R2 ga yuklaydi.
 *
 *   npm run daf:gen-dialog-audio -- --dialog u02-d2     — bitta (namuna darvozasi)
 *   npm run daf:gen-dialog-audio -- --unit 2            — unitning hammasi
 *   npm run daf:gen-dialog-audio -- --unit 1 --unit 2   — bir nechta unit
 *
 * PULLIK: $0.10 / 1 000 belgi (2026-09-11). Manifestda xeshi mos dialog
 * QAYTA yasalmaydi — qayta yuritish pul sarflamaydi. Xeshi eskirgan
 * (matni tahrirlangan) dialog qayta yasaladi va eski kalit almashadi.
 *
 * Ro'yxatda (`stimmen.json`) yo'q gapiruvchi — TO'XTASH, standart ovoz
 * yo'q: ovoz obrazga biriktirilgan va kurs davomida o'zgarmaydi.
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
 *    saqlanadi, keyingisiga o'tishdan OLDIN. Ilgari BUTUN partiya
 *    tugagandan keyin bitta yozuv bo'lgan — o'rtadagi bitta dialog
 *    yiqilsa, undan oldingi PULLIK yasalgan dialoglarning kaliti hech
 *    qayerga yozilmasdan yo'qolardi, keyingi yuritish esa ularni QAYTA
 *    to'lardi. Endi N-dialog yiqilsa faqat O'SHA dialog "havoda qoladi";
 *    1..N-1 allaqachon manifestda, xesh tekshiruvi ularni qayta
 *    yasashdan saqlaydi.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { FalClient } from '../src/daf/media/fal-client';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import { polstereMp3, POLSTER_KENNUNG } from '../src/daf/media/audio-polster';
import {
  dialogTextHash,
  type DialogAudioManifest,
} from '../src/daf/inhalt/dialog-audio';
import type { Dialog, DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const MANIFEST_PATH = join(A1, 'dialog-audio.json');
const STIMMEN_PATH = join(A1, 'stimmen.json');

/**
 * Bir yuritishdagi belgi chegarasi. 12 dialog = 1 592 belgi; chegara
 * 2 500 — tasodifan butun boshqa unit qo'shilib qolsa to'xtaydi.
 */
export const BELGI_CHEGARASI_DIALOG = 2500;

const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

export type Stimmen = Record<string, string>;

/** Har satr → `{ voice, text }`; matn `tts ?? de`. Noma'lum gapiruvchi — xato. */
export function dialogInputs(
  dialog: Dialog,
  stimmen: Stimmen,
): Array<{ voice: string; text: string }> {
  return dialog.zeilen.map((z) => {
    const voice = stimmen[z.sprecher];
    if (!voice) {
      throw new Error(
        `${dialog.id}: «${z.sprecher}» uchun ovoz yo'q — stimmen.json ga qo'shing. ` +
          "Standart ovoz ATAYLAB yo'q: obraz ovozi kurs davomida o'zgarmaydi.",
      );
    }
    return { voice, text: z.tts ?? z.de };
  });
}

/**
 * Manifestda xeshi mos dialoglar o'tkazib yuboriladi — idempotentlik.
 *
 * Ikkinchi qatlam (2026-09-12 ko'rik, F1): ro'yxatda bir xil `id` IKKI
 * marta kelib qolsa — argument tahlili qatlamida chetlab o'tilgan
 * qanday yo'l bilan bo'lmasin — faqat BIRINCHISI qoladi. Bu funksiya
 * generatsiyaga yuboriladigan RO'YXATNING O'ZI, shuning uchun himoya
 * shu yerda eng kuchli: hech qanday kirish shakli bitta dialogni ikki
 * marta PULLIK generatsiya qildirmasin.
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
    if (manifest[d.id]?.textHash !== dialogTextHash(d.zeilen)) {
      natija.push(d);
    }
  }
  return natija;
}

export function gesamtZeichenDialoge(dialoge: Dialog[]): number {
  return dialoge.reduce(
    (sum, d) => sum + d.zeilen.reduce((s, z) => s + (z.tts ?? z.de).length, 0),
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
 * `--unit 2 --unit 2`) BIR XIL faylni IKKI marta yuklardi — 6 dialogli
 * unit 12 ta yozuvga aylanardi, va har biri PULLIK ravishda IKKI marta
 * generatsiya qilinardi (manifestda faqat OXIRGI kalit qolib,
 * birinchisi R2'da yetim bo'lib qolardi). Shuning uchun `units` HAM,
 * `dialoge` HAM `Set` orqali dublikatsizlanadi — bayroq bir marta
 * yozilgani ham, ikki marta yozilgani ham bir xil natija beradi.
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
  inputs: Array<{ voice: string; text: string }>,
) => Promise<{ key: string; polster?: string }>;

/**
 * Dialoglarni BIRIN-KETIN ishlaydi (2026-09-12 ko'rik, F2): har biri
 * `generiere` bilan yasaladi/yuklanadi, DARHOL manifestga yoziladi va
 * `speichereManifest` bilan diskka saqlanadi — keyingisiga o'tishdan
 * OLDIN.
 *
 * Ilgari BUTUN partiya tugagandan keyin bitta yozuv bo'lgan: o'rtadagi
 * bitta dialog yiqilsa, undan OLDINGI PULLIK yasalgan dialoglarning
 * kaliti hech qayerga yozilmasdan yo'qolardi, va keyingi yuritish
 * ularni QAYTA to'lardi. Endi N-dialog yiqilsa xato tashqariga
 * uloqtiriladi va sikl TO'XTAYDI, lekin 1..N-1 allaqachon manifestda VA
 * diskda saqlangan — pul yo'qolmaydi, qayta yuritish faqat to'xtagan
 * joydan davom etadi (xesh tekshiruvi ularni qayta yasashdan saqlaydi).
 *
 * `manifest` argument sifatida MUTATSIYA qilinadi (nusxa emas) — shuning
 * uchun xato tashlangandan keyin ham chaqiruvchi allaqachon yozilgan
 * yozuvlarni o'sha ob'ektning o'zidan ko'ra oladi.
 */
export async function generiereDialogeNacheinander(
  dialoge: Dialog[],
  inputsById: Map<string, Array<{ voice: string; text: string }>>,
  manifest: DialogAudioManifest,
  generiere: DialogGenerierFn,
  speichereManifest: (manifest: DialogAudioManifest) => void,
): Promise<void> {
  for (const d of dialoge) {
    let result: { key: string; polster?: string };
    try {
      result = await generiere(d, inputsById.get(d.id)!);
    } catch (err) {
      throw new Error(
        `"${d.titelDe}" (${d.id}) yasalmadi/yuklanmadi: ${(err as Error).message}`,
      );
    }
    manifest[d.id] = {
      key: result.key,
      textHash: dialogTextHash(d.zeilen),
      // Task 11e: `generiere` jimlik qo'shgan bo'lsa (`polster` maydoni
      // bilan qaytsa) shu yerda yoziladi. Eski chaqiruvchilar (testlar)
      // `polster`siz `{key}` qaytaradi — u holda maydon UMUMAN
      // qo'shilmaydi, mavjud "faqat key+textHash" assertsiyalari buzilmaydi.
      ...(result.polster ? { polster: result.polster } : {}),
    };
    speichereManifest(manifest);
    console.log(
      `  ${d.id}: ${d.titelDe} → yasaldi, yuklandi, manifestga yozildi`,
    );
  }
}

/**
 * Bitta dialog uchun to'liq quvur (Task 11e): fal.ai orqali yasaydi,
 * baytlarni yuklab oladi, JIMLIK QO'SHADI (`polster`), YANGI tasodifiy
 * kalit bilan R2'ga yuklaydi.
 *
 * Bog'liqliklar (fal, uploader, fetchFn, polster) INJEKTSIYA QILINADI —
 * `main()` haqiqiy nusxalarni beradi, testlar esa soxta (network'siz)
 * nusxalar bilan «jimlik chaqirildi, natija yuklandi» ni tekshiradi.
 *
 * Eski `uploadMissing` yo'li BU YERDA ishlatilmaydi: kalit har doim
 * YANGI va tasodifiy (`neuerAudioSchluessel()`), demak R2'da hech qachon
 * oldindan mavjud bo'lmaydi — mavjudlikni tekshirish keraksiz.
 */
export function erstelleGeneriere(
  fal: Pick<FalClient, 'dialog'>,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
  fetchFn: typeof fetch,
  polster: (bytes: Buffer) => Promise<Buffer>,
): DialogGenerierFn {
  return async (d, inputs) => {
    const sourceUrl = await fal.dialog(inputs);
    // Pul xavfsizligi (2026-09-12 ko'rikning davomi): bu yerdan keyin HALI
    // uchta bosqich bor (yuklab olish, jimlik, R2'ga yuklash) — birortasi
    // yiqilsa, ENDIGINA PULLIK yasalgan audio hech qayerga yozilmagan
    // bo'lardi va uni QAYTA to'lab yasashga to'g'ri kelardi. `sourceUrl`
    // fal.ai'ning VAQTINCHALIK ommaviy manzili (sir emas) — konsolga
    // chiqarilishi keyingi muvaffaqiyatsizlikda qo'lda tiklab olish
    // imkonini beradi.
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
  const manifest: DialogAudioManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DialogAudioManifest)
    : {};

  const qoldi = zuGenerierenDialoge(ladeDialoge(), manifest);
  console.log(`${qoldi.length} ta dialogga ovoz kerak.`);
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }
  // Gapiruvchilar TARMOQDAN OLDIN tekshiriladi — yarim yasab to'xtamasin.
  const inputsById = new Map(
    qoldi.map((d) => [d.id, dialogInputs(d, stimmen)]),
  );

  const zeichen = gesamtZeichenDialoge(qoldi);
  console.log(
    `Jami belgi: ${zeichen} (≈ $${((zeichen / 1000) * 0.1).toFixed(3)}).`,
  );
  pruefeDialogBudget(zeichen);

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

  // Bitta dialog uchun to'liq quvur: fal.ai orqali yasaydi, baytlarni
  // yuklab oladi, JIMLIK QO'SHADI (Task 11e), R2'ga YANGI kalit bilan
  // yuklaydi. Muvaffaqiyatsiz bosqich uloqtiriladi —
  // `generiereDialogeNacheinander` buni "bu dialog to'liq muvaffaqiyatsiz"
  // deb talqin qiladi va manifestga yozmaydi (F2).
  const generiere = erstelleGeneriere(fal, uploader, fetch, polstereMp3);

  await generiereDialogeNacheinander(
    qoldi,
    inputsById,
    manifest,
    generiere,
    (m) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n'),
  );
  console.log(
    `Manifest yangilandi: ${MANIFEST_PATH} (${qoldi.length} ta dialog).`,
  );
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    // Butun xatoni (stack bilan) chop etadi — faqat `.message` emas,
    // Error bo'lmagan uloqtirish ham `undefined` bo'lib qolmasin
    // (2026-09-12 ko'rik, F5; `daf-gen-audio.ts` dagi bilan bir xil naqsh).
    console.error(e);
    process.exit(1);
  });
}
