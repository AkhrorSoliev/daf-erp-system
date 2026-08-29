import {
  buildSentencePrompt,
  parseSentences,
  generateForUnit,
} from './sentence-generate';
import type { TranslateModel } from '../translate/translate-model';

function model(...replies: string[]): TranslateModel {
  const q = [...replies];
  return { name: 'test', complete: async () => q.shift() ?? '' };
}

describe('buildSentencePrompt', () => {
  it('ruxsat etilgan so`zlarni va namunani so`rovga qo`yadi', () => {
    const p = buildSentencePrompt(['heißen', 'kommen'], ['Wie heißt du?'], 5);
    expect(p).toContain('heißen');
    expect(p).toContain('Wie heißt du?');
    expect(p).toContain('5');
  });
});

describe('parseSentences', () => {
  it('har qatordan nemischa va o`zbekchani ajratadi', () => {
    expect(parseSentences('Ich heiße Anna. | Mening ismim Anna.\n')).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
    ]);
  });

  it('ajratgichsiz qatorni tashlaydi', () => {
    expect(parseSentences('buzuq qator\nA. | B.')).toEqual([
      { de: 'A.', uz: 'B.' },
    ]);
  });

  // Model so'rovdagi taqiqqa qaramay qatorlarni raqamlab qaytardi va
  // «17.» gapning ichiga kirib qoldi.
  it('qator boshidagi raqam va tirelarni olib tashlaydi', () => {
    expect(
      parseSentences(
        '17. Ich heiße Anna. | Mening ismim Anna.\n- Wer ist das? | Bu kim?',
      ),
    ).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
      { de: 'Wer ist das?', uz: 'Bu kim?' },
    ]);
  });

  it('bo`sh javobdan bo`sh ro`yxat qaytaradi', () => {
    expect(parseSentences('')).toEqual([]);
  });
});

describe('generateForUnit', () => {
  const allowed = new Set(['heiße', 'anna', 'komme']);

  it('toza gaplarni saqlaydi', async () => {
    const r = await generateForUnit(
      model('Ich heiße Anna. | Mening ismim Anna.'),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  // Tekshirilmagan generatsiya jimgina buzadi — shuning uchun
  // notanish so'zli gap qabul qilinmaydi.
  it('notanish so`zli gapni rad etadi va qayta so`raydi', async () => {
    const r = await generateForUnit(
      model(
        'Ich komme aus Kalifornien. | Men Kaliforniyadanman.',
        'Ich heiße Anna. | Mening ismim Anna.',
      ),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
    ]);
    expect(r.rejected[0].unknown).toEqual(['kalifornien']);
  });

  // Takror gap mashq bermaydi: birinchi yuritishda 30 gapdan
  // faqat 22 tasi unikal chiqdi («Ich bin Student.» uch marta).
  it('bir xil gapni ikki marta saqlamaydi', async () => {
    const r = await generateForUnit(
      model(
        'Ich heiße Anna. | Mening ismim Anna.\nIch heiße Anna. | Mening ismim Anna.',
      ),
      { allowed, words: [], examples: [], count: 5 },
    );
    expect(r.kept).toHaveLength(1);
    expect(r.duplicates).toBe(1);
    expect(r.rejected).toHaveLength(0);
  });

  // Bosh harf va nuqta gapni boshqa gapga aylantirmaydi.
  it('takrorni katta-kichik harf va nuqtadan qat`i nazar topadi', async () => {
    const r = await generateForUnit(
      model(
        'Ich heiße Anna. | Mening ismim Anna.\nich heiße anna | Mening ismim Anna.',
      ),
      { allowed, words: [], examples: [], count: 5 },
    );
    expect(r.kept).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });

  // «Hallo!» validatordan o'tadi — hamma so'z tanish — lekin mashq emas.
  it('uch so`zdan qisqa javobni rad etadi', async () => {
    const r = await generateForUnit(model('Hallo! | Salom!'), {
      allowed,
      words: [],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected[0]).toEqual({
      de: 'Hallo!',
      unknown: [],
      reason: 'length',
    });
  });

  it('yetti so`zdan uzun gapni rad etadi', async () => {
    const long = 'Ich heiße Anna und ich komme aus Anna. | Uzun gap.';
    const r = await generateForUnit(model(long), {
      allowed,
      words: [],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected[0].reason).toBe('length');
  });

  // Dedup va uzunlik filtri javobning bir qismini yeydi.
  it('kerakidan ko`proq so`raydi', async () => {
    const prompts: string[] = [];
    const spy: TranslateModel = {
      name: 'test',
      complete: async (p: string) => {
        prompts.push(p);
        return '';
      },
    };
    await generateForUnit(spy, {
      allowed,
      words: [],
      examples: [],
      count: 10,
    });
    expect(prompts[0]).toContain('15');
  });

  // Cheksiz urinish skriptni qotirib qo'yardi.
  it('uch urinishdan keyin gapni tashlaydi', async () => {
    const bad = 'Ich komme aus Kalifornien. | Men Kaliforniyadanman.';
    const r = await generateForUnit(model(bad, bad, bad, bad), {
      allowed,
      words: ['heißen'],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });
});
