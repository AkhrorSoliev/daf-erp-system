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
 * Shuning uchun tekshiruv tiplar emas, MATN darajasida: `student.create(`
 * yozadigan har bir fayl quyidagi ro'yxatda bo'lishi SHART, va ro'yxatdagi
 * har bir fayl `recordDirectOrigin` ni ham chaqirishi shart.
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

const CREATES_STUDENT = /\b(tx|prisma|this\.prisma)\.student\.create\(/;
const WRITES_ORIGIN = /recordDirectOrigin\(/;

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
      fix: "yangi yo'l qo'shsangiz, StudentLeadOriginService.recordDirectOrigin ni O'SHA tranzaksiya ichida chaqiring va faylni ALLOWED ro'yxatiga qo'shing",
    }).toEqual({
      creators: ALLOWED.map((a) => a.file).sort(),
      fix: "yangi yo'l qo'shsangiz, StudentLeadOriginService.recordDirectOrigin ni O'SHA tranzaksiya ichida chaqiring va faylni ALLOWED ro'yxatiga qo'shing",
    });
  });

  it.each(ALLOWED)('$file lid yozuvini ham yozadi — $why', ({ file }) => {
    const full = join(REPO, file);
    const source = readFileSync(full, 'utf8');

    // `students-write.service.ts` xizmatni `leadOrigin` orqali chaqiradi,
    // qolgan ikkovi to'g'ridan — ikkala shakl ham shu regexga tushadi.
    expect({ file, writesOrigin: WRITES_ORIGIN.test(source) }).toEqual({
      file,
      writesOrigin: true,
    });
  });
});
