/**
 * BITTA dialogni uchta ayol-ovoz nomzodi bilan gapirtirib, ODAM eshitib
 * tanlashi uchun fal.ai manzillarini chiqaradi.
 *
 *   npm run daf:dialog-voice-samples -- --dialog u02-d2                — hisobni ko'rish (bepul)
 *   npm run daf:dialog-voice-samples -- --dialog u02-d2 --dry-run      — xuddi shu, aniq bepul rejim
 *   npm run daf:dialog-voice-samples -- --dialog u02-d2 --variant laura — bitta variantni QAYTA sinash
 *
 * NEGA KERAK: birinchi namuna Aria (ayol) + Liam (erkak) bilan yasalgan
 * edi. Xo'jayinning xulosasi — Liam yaxshi, Aria emas, va natija umuman
 * "tabiiyroq" eshitilishi kerak. Shuning uchun Liam saqlanadi, Aria esa
 * uchta nomzod bilan almashtirib ko'riladi: Sarah, Matilda, Laura
 * (`VARIANTEN`). Tanlov — xuddi `daf-voice-samples.ts`dagi kabi — ODAMGA
 * qoldirilgan: bu skript faqat solishtirish materialini tayyorlaydi.
 *
 * QAYSI GAPIRUVCHI ALMASHTIRILADI (ISM QOTIRILMAGAN): `u02-d2`da Anna
 * (ayol) va Jonas (erkak) gapiradi. Kodda "Anna" deb yozish o'rniga,
 * almashtiriladigan gapiruvchi `stimmen.json`dan HOZIRGI ovozi
 * `ESKI_AYOL_STIMME` ("Aria" — birinchi namunada ishlatilgan, rad
 * etilgan ovoz) ga teng bo'lgan gapiruvchi sifatida topiladi
 * (`ayolGapiruvchilarniTop`). Shu tufayli bu qoida ISMGA emas, OVOZGA
 * bog'langan: agar ertaga boshqa dialogda boshqa ism xuddi shu Aria
 * ovozida gapirsa, o'sha ham avtomatik almashadi; Jonas esa Liamda
 * qolgani uchun HECH QACHON tegilmaydi. Agar bu avtomatik qoida boshqa
 * bir dialog uchun mos kelmasa (masalan ayol boshqa ovozda bo'lsa),
 * `--stimme-override <Ism>` bilan ANIQ ko'rsatish mumkin — skript
 * taxmin qilib xato gapiruvchini almashtirib yubormaydi, aksincha hech
 * kim topilmasa TO'XTAYDI.
 *
 * KONTENT: kurs matni endi FAQAT nemischa shaxs ismi ishlatadi —
 * `u02-d2`dagi satr endi "Sie heißt Lena." deydi (ataylab, o'zbekcha
 * ism emas). Shu namunalar aynan shu matn bilan yasaladi — xo'jayin
 * nemischa ismning ham qanday eshitilishini baholaydi.
 *
 * BU SKRIPT R2'GA YUKLAMAYDI, `dialog-audio.json`ni O'QIMAYDI/YOZMAYDI,
 * VA BAZAGA TEGMAYDI — bular tashlab yuboriladigan solishtiruv
 * namunalari, fal.ai qaytargan manzil to'g'ridan-to'g'ri eshitiladi.
 * Ishlab chiqarish audiosi (manifestga yoziladigan) faqat CEO tanlagan
 * ovoz bilan `daf-gen-dialog-audio.ts` orqali keyinroq yasaladi.
 *
 * PULLIK: `fal-ai/elevenlabs/text-to-dialogue/eleven-v3`, $0.10/1000
 * belgi — `daf-gen-dialog-audio.ts` bilan bir xil model. Vazifa brifi
 * qat'iy belgilagan: 3 variant × ~150 belgi ≈ 450 belgi, ≈ $0.045 jami.
 * `--dry-run` bilan chaqiruvsiz hisobni oldindan ko'rish mumkin —
 * PULLIK chaqiruvlardan OLDIN sonlarni tekshirish uchun.
 *
 * `main()` faqat fayl to'g'ridan-to'g'ri ishga tushirilganda yuguradi
 * (`require.main === module`) — testlar bu faylni import qilganda HECH
 * QANDAY tarmoq so'rovi yubormaydi (`daf-voice-samples.ts`dagi bilan
 * bir xil naqsh, bir xil sabab bilan).
 *
 * QAYTA URINISH: bitta variant fal.ai xatosi bilan yiqilsa, bu skript
 * O'ZI qayta urinmaydi (aniq xato bilan to'xtaydi — sibling
 * skriptlardagi kabi). Operator xatoni ko'rgandan keyin FAQAT o'sha
 * variantni `--variant <id>` bilan qayta ishga tushiradi — allaqachon
 * muvaffaqiyatli bo'lgan variantlar UCHUN PUL IKKINCHI MARTA
 * SARFLANMAYDI.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FalClient } from '../src/daf/media/fal-client';
import {
  dialogInputs,
  gesamtZeichenDialoge,
  type Stimmen,
} from './daf-gen-dialog-audio';
import type { Dialog, DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const STIMMEN_PATH = join(A1, 'stimmen.json');

/**
 * Uchta ayol-ovoz nomzodi. `speed` yo'q — `FalClient.dialog()` bunday
 * parametrni qabul qilmaydi (fal-client.ts: "Tezlik parametri modelda
 * YO'Q — sekin variant mijoz pleyerida").
 */
export interface Variante {
  id: string;
  label: string;
  stimme: string;
}

export const VARIANTEN: Variante[] = [
  { id: 'sarah', label: 'ElevenLabs — Sarah', stimme: 'Sarah' },
  { id: 'matilda', label: 'ElevenLabs — Matilda', stimme: 'Matilda' },
  { id: 'laura', label: 'ElevenLabs — Laura', stimme: 'Laura' },
];

/**
 * Birinchi namunada ishlatilgan, xo'jayin RAD ETGAN ayol ovozi. Shu
 * ovoz `stimmen.json`da hali ham tegishli gapiruvchiga bog'langan —
 * shuning uchun "kim ayol ekanini" ISM bo'yicha emas, aynan shu OVOZ
 * bo'yicha aniqlaymiz (`ayolGapiruvchilarniTop`).
 */
export const ESKI_AYOL_STIMME = 'Aria';

/**
 * Narx chegarasi (jami belgi, HAMMA variant birga). Vazifa brifi: 1
 * dialog (≈150 belgi) × 3 variant ≈ 450 belgi, ≈ $0.045. Chegara
 * shundan sal yuqori qo'yilgan — matn ozgina tahrirlansa ham (masalan
 * bitta so'z almashtirilsa) skript ishlayveradi, lekin boshqa (uzunroq)
 * dialog yoki qo'shimcha variant tasodifan tanlanib qolsa shu yerda
 * PULNI SARFLASHDAN OLDIN to'xtaydi.
 */
export const BELGI_CHEGARASI = 600;

export function pruefeBudget(zeichenzahl: number): void {
  if (zeichenzahl > BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichenzahl} belgi (chegara ${BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/**
 * Dialogdagi gapiruvchilardan qaysilari HOZIR `ESKI_AYOL_STIMME` bilan
 * gapirayotganini topadi (birinchi uchragan tartibda, dublikatsiz) —
 * ular "almashtiriladigan ayol ovoz" hisoblanadi. Ism emas, OVOZ
 * bo'yicha: `stimmen.json`dagi kim boshqa ovozda bo'lsa (masalan Jonas
 * → Liam), bu funksiya uni qaytarmaydi va u o'z ovozida qoladi.
 */
export function ayolGapiruvchilarniTop(
  dialog: Dialog,
  stimmen: Stimmen,
): string[] {
  const korilgan = new Set<string>();
  const natija: string[] = [];
  for (const z of dialog.zeilen) {
    if (korilgan.has(z.sprecher)) continue;
    korilgan.add(z.sprecher);
    if (stimmen[z.sprecher] === ESKI_AYOL_STIMME) natija.push(z.sprecher);
  }
  return natija;
}

/** `stimmen`ning nusxasi — faqat ko'rsatilgan gapiruvchilar yangi ovozga o'tadi. */
export function stimmenOverrideBilan(
  stimmen: Stimmen,
  gapiruvchilar: string[],
  yangiOvoz: string,
): Stimmen {
  const natija = { ...stimmen };
  for (const sprecher of gapiruvchilar) natija[sprecher] = yangiOvoz;
  return natija;
}

/**
 * `ayolGapiruvchilar` ro'yxatidagi HAR bir ism shu dialogda haqiqatan
 * gapirishini tekshiradi — `--stimme-override` yozuv xatosi (masalan
 * "Ana" o'rniga "Anna") jimgina hech narsaga ta'sir qilmay qolib
 * ketmasin. Bunday xato bo'lmasa, `stimmenOverrideBilan` shunchaki
 * `stimmen`ga foydalanilmaydigan yangi kalit qo'shib qo'yardi va
 * haqiqiy gapiruvchi (masalan Anna) eski — RAD ETILGAN — ovozda
 * qolib ketardi, hech qanday xato ko'rinmasdan.
 */
export function tekshirGapiruvchilarDialogda(
  ayolGapiruvchilar: string[],
  barchaGapiruvchilar: string[],
): void {
  for (const sprecher of ayolGapiruvchilar) {
    if (!barchaGapiruvchilar.includes(sprecher)) {
      throw new Error(
        `"${sprecher}" bu dialogda yo'q. Mavjud gapiruvchilar: ${barchaGapiruvchilar.join(', ')}.`,
      );
    }
  }
}

/**
 * `--variant <id>` bilan ro'yxatni toraytiradi — bitta variant fal.ai
 * xatosi bilan yiqilganda, operator FAQAT o'shani qayta ishga
 * tushirishi uchun (allaqachon muvaffaqiyatli bo'lganlar uchun pul
 * ikkinchi marta sarflanmasin). Bayroqsiz — HAMMASI (standart oqim).
 * Noma'lum ID — yozuv xatosini jimgina yutib yubormaslik uchun xato.
 */
export function parseVariantFilter(
  argv: string[],
  alle: Variante[] = VARIANTEN,
): Variante[] {
  const tanlangan = argValues(argv, '--variant');
  if (tanlangan.length === 0) return alle;
  return tanlangan.map((id) => {
    const v = alle.find((x) => x.id === id);
    if (!v) {
      throw new Error(
        `Noma'lum variant ID: "${id}". Mavjud: ${alle.map((x) => x.id).join(', ')}.`,
      );
    }
    return v;
  });
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function argValues(argv: string[], flag: string): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
  });
  return out;
}

function argHasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function ladeDialog(dialogId: string): Dialog {
  const unit = dialogId.slice(0, 3);
  const pfad = join(A1, unit, 'dialoge.json');
  const { dialoge } = JSON.parse(readFileSync(pfad, 'utf8')) as DialogeFile;
  const dialog = dialoge.find((d) => d.id === dialogId);
  if (!dialog) {
    throw new Error(`"${dialogId}" topilmadi (${pfad}).`);
  }
  return dialog;
}

/**
 * `FalClient`ning shu skriptga kerakli qismi — testda soxta (fake)
 * klient bilan almashtirish uchun ajratilgan tor interfeys
 * (`daf-voice-samples.ts`dagi `SpeechClient` bilan bir xil naqsh).
 */
export interface DialogClient {
  dialog(inputs: Array<{ voice: string; text: string }>): Promise<string>;
}

export interface NamunaNatija {
  variant: Variante;
  url: string;
}

/**
 * Har variant uchun: `stimmen`ni shu variantning ovozi bilan
 * o'zgartiradi (FAQAT ayol gapiruvchi(lar)), `dialogInputs`ni (sibling
 * skriptdan IMPORT qilingan, ko'chirilmagan) chaqiradi, va
 * `client.dialog()` orqali fal.ai manzilini oladi.
 *
 * Jonas (yoki har qanday ovozi o'zgarmagan gapiruvchi) uchun ovoz
 * `stimmen.json`dan O'ZGARISHSIZ o'tadi — override faqat berilgan
 * `ayolGapiruvchilar` ro'yxatidagi ismlarga tegadi.
 */
export async function sammleDialogNamunalari(
  client: DialogClient,
  dialog: Dialog,
  stimmen: Stimmen,
  ayolGapiruvchilar: string[],
  variants: Variante[] = VARIANTEN,
): Promise<NamunaNatija[]> {
  const natija: NamunaNatija[] = [];
  for (const variant of variants) {
    const patched = stimmenOverrideBilan(
      stimmen,
      ayolGapiruvchilar,
      variant.stimme,
    );
    const inputs = dialogInputs(dialog, patched);
    let url: string;
    try {
      url = await client.dialog(inputs);
    } catch (err) {
      throw new Error(
        `"${variant.label}" varianti yiqildi: ${(err as Error).message}`,
      );
    }
    natija.push({ variant, url });
  }
  return natija;
}

async function main(): Promise<void> {
  const dialogId = argValue(process.argv, '--dialog');
  if (!dialogId) {
    throw new Error(
      'Kerak: --dialog <kod> (masalan --dialog u02-d2). Bu skript BITTA dialog bilan ishlaydi.',
    );
  }

  const stimmen = JSON.parse(readFileSync(STIMMEN_PATH, 'utf8')) as Stimmen;
  const dialog = ladeDialog(dialogId);
  const barchaGapiruvchilar = Array.from(
    new Set(dialog.zeilen.map((z) => z.sprecher)),
  );

  const override = argValues(process.argv, '--stimme-override');
  const ayolGapiruvchilar =
    override.length > 0 ? override : ayolGapiruvchilarniTop(dialog, stimmen);

  if (ayolGapiruvchilar.length === 0) {
    throw new Error(
      `"${dialogId}"da "${ESKI_AYOL_STIMME}" ovozli gapiruvchi avtomatik topilmadi — ` +
        "qaysi gapiruvchi almashtirilishini --stimme-override <Ism> bilan aniq ko'rsating.",
    );
  }
  tekshirGapiruvchilarDialogda(ayolGapiruvchilar, barchaGapiruvchilar);

  const saqlanadiganlar = barchaGapiruvchilar.filter(
    (s) => !ayolGapiruvchilar.includes(s),
  );
  console.log(`Dialog: ${dialog.id} — ${dialog.titelDe}`);
  console.log(
    `Almashtiriladi (ayol, hozir "${ESKI_AYOL_STIMME}"): ${ayolGapiruvchilar.join(', ')}`,
  );
  console.log(
    `O'zgarmaydi (stimmen.json ovozida qoladi): ${
      saqlanadiganlar.length > 0
        ? saqlanadiganlar.map((s) => `${s}=${stimmen[s]}`).join(', ')
        : '(yo`q)'
    }`,
  );

  const variants = parseVariantFilter(process.argv);
  const zeichenBirDialog = gesamtZeichenDialoge([dialog]);
  const jami = zeichenBirDialog * variants.length;
  console.log(
    `${variants.length} variant (${variants.map((v) => v.label).join(', ')}), ` +
      `dialog boshiga ${zeichenBirDialog} belgi, jami ${jami} belgi ` +
      `(≈ $${((jami / 1000) * 0.1).toFixed(3)}).`,
  );
  pruefeBudget(jami);

  if (argHasFlag(process.argv, '--dry-run')) {
    console.log("DRY RUN — hech qanday fal.ai chaqiruvi qilinmadi.");
    return;
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error(
      "FAL_KEY sozlanmagan — chaqiruv TO'XTATILDI, hech narsa yuborilmadi.",
    );
  }

  const fal = new FalClient(apiKey);
  const natijalar = await sammleDialogNamunalari(
    fal,
    dialog,
    stimmen,
    ayolGapiruvchilar,
    variants,
  );

  console.log("\nNATIJALAR — har manzilni eshitib solishtiring:");
  for (const { variant, url } of natijalar) {
    console.log(`  ${variant.label}: ${url}`);
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
