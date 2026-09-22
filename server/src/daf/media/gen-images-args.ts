/**
 * `daf-gen-images.ts` skriptining buyruq qatori bayroqlarini o'qiydi.
 *
 * Bu fayl ATAYLAB skriptdan ajratilgan: skript o'zi jest bilan
 * tekshirilmaydi (`rootDir: "src"`, `scripts/` qamrovdan tashqarida),
 * ammo `--unit` talabi — reja bo'yicha eng muhim qoida — sinovsiz
 * qolmasligi kerak. Skript quyida eksport qilingan
 * `parseGenImagesArgs`ni TO'G'RIDAN-TO'G'RI chaqiradi (o'z nusxasini
 * yozib olmaydi), shuning uchun shu funksiyaga yozilgan test haqiqiy
 * chaqiruv yo'lini qamraydi — reja hujjatidagi «tekshirilmagan bog'lanish
 * jimgina uziladi» xatosining aynan shu ko'rinishiga qarshi himoya.
 */

export interface GenImagesArgs {
  /** A1 ichidagi bo'lim tartib raqami (`DafUnit.order`). */
  unit: number;
  /** `true` bo'lsa hech qanday model chaqirilmaydi — faqat son aytiladi. */
  dryRun: boolean;
  /**
   * `true` bo'lsa `content/daf/image-redraw.json` da RAD ETILGAN deb
   * belgilangan so'zlar `imageKey` bor bo'lsa ham qayta chiziladi.
   *
   * Nega alohida bayroq: oddiy yugurish faqat `imageKey = null` so'zlarni
   * oladi, ya'ni rad etilgan rasm hech qachon o'zi qayta chizilmaydi.
   * Buni avtomatik qilib qo'yish ham xato bo'lardi — har oddiy yugurishda
   * jurnaldagi hamma so'z uchun fal.ai qaytadan chaqirilib, pul bekorga
   * sarflanardi.
   */
  redraw: boolean;
}

/**
 * `--unit N` berilmaganda yoki noto'g'ri qiymat bilan berilganda
 * uloqtiriladi. Xabar sabab bilan birga keladi: bu qoida ataylab qat'iy
 * — 450 rasmni bitta yugurishda chiqarib, keyin uslub yoqmasa butun ish
 * bekor ketardi (sinovda `unterschreiben` bilan aynan shu bo'lgan).
 */
export class MissingUnitArgError extends Error {
  constructor(reason: string) {
    super(
      [
        `Bo'lim raqami shart: --unit 1 (${reason})`,
        '',
        "Rasmlar bo'lim-bo'lim chiqariladi va har bo'limdan keyin odam",
        "ko'radi. Sinovda `unterschreiben` rasmi uslubdan siljib chiqqan",
        "edi; 450 rasmni bir yo'la chiqarib, keyin «uslub yoqmadi» deyish",
        "bekor ketgan ish bo'lardi.",
      ].join('\n'),
    );
    this.name = 'MissingUnitArgError';
  }
}

export function parseGenImagesArgs(argv: string[]): GenImagesArgs {
  const i = argv.indexOf('--unit');
  const raw = i === -1 ? undefined : argv[i + 1];

  if (raw === undefined) {
    throw new MissingUnitArgError('bayroq berilmadi');
  }
  // `--unit --dry-run` kabi holatda keyingi bayroqni qiymat deb
  // qabul qilmaslik kerak — aks holda xato jimgina noto'g'ri bo'limga
  // ishlab ketardi.
  if (raw.startsWith('--')) {
    throw new MissingUnitArgError('qiymat berilmadi');
  }

  const unit = Number(raw);
  if (!Number.isInteger(unit) || unit <= 0) {
    throw new MissingUnitArgError(
      `butun musbat son kutilgan, berildi "${raw}"`,
    );
  }

  return {
    unit,
    dryRun: argv.includes('--dry-run'),
    redraw: argv.includes('--redraw'),
  };
}
