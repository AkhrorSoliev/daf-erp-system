/**
 * Uchta ovoz variantidan besh so'zni chiqarib, ODAM eshitib tanlashi
 * uchun disk'ga saqlaydi.
 *
 *   npm run daf:voice-samples
 *
 * NEGA KERAK: `FalClient.speech()` (Chatterbox) hech qachon chaqirilmagan
 * — uning qanday eshitilishi noma'lum. `personas.json` esa ElevenLabs
 * ovozlarini (Rachel, Matilda, ...) belgilab qo'ygan, ammo ular
 * INGLIZCHA o'qitilgan ovozlar — nemischa gapirganda qanday chiqishi
 * ham noma'lum. So'z audiosi boshlang'ich uchun TALAFFUZ NAMUNASI, ya'ni
 * noto'g'ri ovoz umuman ovozsizlikdan YOMONROQ. Shu sababli tanlov
 * ODAMGA qoldirilgan — bu skript faqat solishtirish materialini
 * tayyorlaydi.
 *
 * Besh so'z ataylab har xil talaffuz qiyinchiligini sinaydi: oddiy
 * so'z, umlaut, ß, harf nomi (TTS buni qanday o'qishi noaniq), va
 * ko'p bo'g'inli uzun ibora.
 *
 * MUHIM: bu skript pullik `fal.ai` chaqiruvi qiladi. Shuning uchun u
 * KOORDINATOR/CEO ruxsati bilan QO'LDA yuritiladi — hech qanday CI yoki
 * boshqa skript buni avtomatik chaqirmaydi. `main()` faqat fayl
 * to'g'ridan-to'g'ri (`ts-node` bilan) ishga tushirilganda yuguradi
 * (`require.main === module`), shuning uchun testlar bu faylni
 * import qilganda HECH QANDAY tarmoq so'rovi yubormaydi.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FalClient } from '../src/daf/media/fal-client';

/**
 * Besh so'z — har biri talaffuzning boshqa tomonini sinaydi:
 * oddiy boshlang'ich nuqta, umlaut, ß, harf nomi, uzun ko'p bo'g'inli.
 */
export const PROBEWOERTER = [
  'hallo', // oddiy, boshlang'ich nuqta
  'tschüss', // umlaut
  'heißen', // ß
  'Zett', // harf nomi (`Z` ning `tts` qiymati)
  'Auf Wiedersehen', // ko'p bo'g'inli, uzun
];

export interface Variante {
  id: string;
  label: string;
  /** Faqat ElevenLabs variantlarida bor — Chatterbox ovoz tanlamaydi. */
  stimme?: string;
}

export const VARIANTEN: Variante[] = [
  { id: 'chatterbox', label: "Chatterbox (mavjud)" },
  {
    id: 'eleven-rachel',
    label: 'ElevenLabs — Rachel (Anna)',
    stimme: 'Rachel',
  },
  {
    id: 'eleven-matilda',
    label: 'ElevenLabs — Matilda (Sabine)',
    stimme: 'Matilda',
  },
];

/**
 * Narx chegarasi (belgi soni). Task-6 brifida qat'iy belgilangan —
 * bu son o'zboshimchalik bilan o'zgartirilmaydi.
 */
export const BELGI_CHEGARASI = 300;

/**
 * Chaqiruvdan OLDIN to'xtatuvchi himoya. Skript boshida, `FalClient`
 * yaratilishidan va birinchi tarmoq so'rovidan OLDIN chaqiriladi —
 * noto'g'ri (masalan qo'shimcha variant yoki so'z qo'shib yuborilgan)
 * skript pulni sarflab bo'lgandan keyin emas, sarflashdan OLDIN
 * to'xtaydi.
 */
export function pruefeBudget(zeichenzahl: number): void {
  if (zeichenzahl > BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichenzahl} belgi (chegara ${BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/**
 * Jami belgi soni: har variant har so'zni bir marta talaffuz qiladi,
 * shuning uchun bitta aylanishning narxi (so'zlar belgi yig'indisi)
 * variantlar soniga ko'paytiriladi.
 */
export function gesamtZeichenzahl(
  woerter: string[] = PROBEWOERTER,
  variantenSoni: number = VARIANTEN.length,
): number {
  const birAylanish = woerter.reduce((sum, wort) => sum + wort.length, 0);
  return birAylanish * variantenSoni;
}

/** Namunalar shu katalog ostiga tushadi — `.gitignore`da `.tmp-*` bor. */
export const CHIQISH_KATALOGI = join(__dirname, '..', '.tmp-voice-samples');

/**
 * So'zni fayl nomiga aylantiradi. `Zett` katta harf bilan, `Auf
 * Wiedersehen`da bo'shliq bor — ikkalasi ham ba'zi vositalarda (masalan
 * qobiqda qo'shtirnoqsiz ochishda) muammo qiladi, shuning uchun kichik
 * harfga o'giriladi va bo'shliq tire bilan almashtiriladi. Umlaut va
 * ß saqlanib qoladi — zamonaviy fayl tizimlari UTF-8 nomni muammosiz
 * ushlaydi, va ular aynan shu so'zlarni farqlash uchun kerak.
 */
export function faylNomiUchunSlug(wort: string): string {
  return wort.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Bitta namunaning disk yo'li: `<chiqish>/<variant>/<so'z>.mp3`. */
export function dateiYoli(variantId: string, wort: string): string {
  return join(CHIQISH_KATALOGI, variantId, `${faylNomiUchunSlug(wort)}.mp3`);
}

/**
 * fal.ai qaytargan manzildagi baytlarni yuklab, diskka yozadi.
 *
 * `fetchFn` inyeksiya qilinadi (`FalClient` va `verifyImageUrl`dagi
 * bilan bir xil naqsh) — testda haqiqiy tarmoqqa chiqmasdan, soxta
 * javob bilan sinash mumkin.
 */
export async function ovozniYukla(
  url: string,
  faylYoli: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Ovoz yuklanmadi (${res.status}): ${url}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(faylYoli, bytes);
}

interface KorikQatori {
  variant: string;
  soz: string;
  fayl: string;
}

async function main() {
  const gesamt = gesamtZeichenzahl();
  console.log(
    `Jami belgi soni: ${gesamt} (chegara ${BELGI_CHEGARASI}), ${VARIANTEN.length} variant x ${PROBEWOERTER.length} so'z.`,
  );
  try {
    pruefeBudget(gesamt);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.error(
      "FAL_KEY sozlanmagan — chaqiruv TO'XTATILDI, hech narsa yuborilmadi.",
    );
    process.exitCode = 1;
    return;
  }

  const fal = new FalClient(apiKey);
  const korik: KorikQatori[] = [];

  for (const variant of VARIANTEN) {
    mkdirSync(join(CHIQISH_KATALOGI, variant.id), { recursive: true });

    for (const wort of PROBEWOERTER) {
      const url = variant.stimme
        ? await fal.speechMitStimme(wort, variant.stimme)
        : await fal.speech(wort);

      const faylYoli = dateiYoli(variant.id, wort);
      await ovozniYukla(url, faylYoli);
      korik.push({ variant: variant.label, soz: wort, fayl: faylYoli });
      console.log(`  ${variant.label} — "${wort}" → ${faylYoli}`);
    }
  }

  console.log('\nKO`RIK RO`YXATI — har birini eshitib solishtiring:');
  console.table(korik);
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda yuguradi — testlar bu
// faylni import qilganda `require.main !== module`, shuning uchun
// hech qanday pullik chaqiruv testda ishlamaydi.
if (require.main === module) {
  void main();
}
