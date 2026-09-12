import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Har bir o'quvchi lid yozuvi qoldiradi (ADR-0017) — bu qorovul o'sha
 * va'daning yagona ishonchli tarafi.
 *
 * Birinchi urinishda kafolat `StudentsWriteService.create` ga MAJBURIY
 * `origin` parametri qo'yish bilan berilgan edi: "kelajakda o'quvchi
 * yaratadigan yangi yo'l yozilsa, kompilyator uni to'xtatadi". Bu faqat
 * o'sha funksiyani CHAQIRADIGAN joylar uchun to'g'ri edi. Prodda esa
 * ikkita yo'l bazaga to'g'ridan yozardi — Telegram boti va mock imtihon
 * ishtirokchisini aylantirish — ya'ni kompilyator ham, ko'rikchi ham
 * ularni ko'rmadi. Natija: deploydan keyingi 16 o'quvchidan 13 tasi lidsiz
 * qoldi, hammasi bot orqali kelgan.
 *
 * Shuning uchun tekshiruv tiplar emas, MATN darajasida: Student qatorini
 * yozadigan har bir fayl quyidagi ro'yxatda bo'lishi SHART, va ro'yxatdagi
 * har bir fayl lid yozuvini ham chaqirishi shart.
 *
 * QOROVUL NIMANI USHLAMAYDI — halol bo'lsin:
 * - Chaqiruv faylda BORLIGINI tekshiradi, u haqiqatan ishlashini emas. O'lik
 *   shox ichidagi chaqiruv ham o'tib ketadi. Bu qismni har yo'lning o'z
 *   xatti-harakat testi ushlaydi (`student-registration-flow.spec.ts`,
 *   `mock-exam-participants.service.spec.ts`, `students-write.origin.spec.ts`).
 * - Boshqa modeldan ichma-ich yozuvni (`enrollment.create({ data: { student:
 *   { create } } })`) ko'rmaydi. Hozir bunday yo'l yo'q va repoda odat emas.
 * - Faqat `src/` ni o'qiydi. `scripts/` va `prisma/seed.ts` dagi o'quvchi
 *   yaratuvchilar dev ma'lumot urug'lari — ular prod voronkasiga tushmaydi.
 */
const ALLOWED: { file: string; why: string }[] = [
  {
    file: 'src/students/students-write.service.ts',
    why: '/students eshigi — origin parametri orqali lid yozadi',
  },
  {
    file: 'src/telegram/scenes/student-registration-flow.ts',
    why: "Telegram boti — o'quvchi va lid bitta tranzaksiyada",
  },
  {
    file: 'src/mock-exams/mock-exam-participants.service.ts',
    why: 'Mock imtihon ishtirokchisini aylantirish',
  },
];

// O'zgaruvchi nomiga bog'lanmaydi: `tx.`, `trx.`, `client.`, `db.` — hammasi
// ushlanadi. `upsert` ham yangi qator yozishi mumkin, `createMany` esa bir
// nechtasini birdan.
const CREATES_STUDENT = /\.student\.(create|createMany|upsert)\(/;
const WRITES_ORIGIN = /record(Direct|SelfSignup)Origin\(/;

const FIX =
  "yangi yo'l qo'shsangiz, StudentLeadOriginService.recordDirectOrigin yoki recordSelfSignupOrigin ni O'SHA tranzaksiya ichida chaqiring, xatti-harakat testini yozing va faylni ALLOWED ro'yxatiga qo'shing";

const SRC = join(__dirname, '..', '..');
const REPO = join(SRC, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.endsWith('.spec.ts'));
const rel = (f: string) => relative(REPO, f).split('\\').join('/');

describe("O'quvchi lidsiz tug'ilmaydi — yagona manba", () => {
  it('faqat ruxsat etilgan fayllar Student qatorini yaratadi', () => {
    const creators = files
      .filter((f) => CREATES_STUDENT.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();

    expect({
      creators,
      fix: FIX,
    }).toEqual({
      creators: ALLOWED.map((a) => a.file).sort(),
      fix: FIX,
    });
  });

  it.each(ALLOWED)('$file lid yozuvini ham yozadi — $why', ({ file }) => {
    const full = join(REPO, file);
    const source = readFileSync(full, 'utf8');

    // `/students` eshigi admin tanlagan manba bilan `recordDirectOrigin`,
    // qolgan ikkovi `recordSelfSignupOrigin` chaqiradi.
    expect({ file, writesOrigin: WRITES_ORIGIN.test(source) }).toEqual({
      file,
      writesOrigin: true,
    });
  });
});
