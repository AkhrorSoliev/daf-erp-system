import {
  buildSentencePrompt,
  parseSentences,
  generateForUnit,
  isPhraseEntry,
  materialWords,
  sourceSentences,
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

  // So'rov validator bilan bir xil narsani ko'rsatishi kerak: validator
  // to'plangan lug'atni kechiradi, demak model ham uni bilishi shart.
  it('oldingi bo`limlarning so`zlarini alohida ro`yxatda beradi', () => {
    const p = buildSentencePrompt(['zwei'], [], 5, ['wohnen']);
    expect(p).toContain('zwei');
    expect(p).toContain('wohnen');
  });

  it('tanish so`zlar bo`lmasa ikkinchi ro`yxat chiqmaydi', () => {
    expect(buildSentencePrompt(['zwei'], [], 5)).not.toContain(
      'kennt der Lernende schon',
    );
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

  // «Wer ist das?» validatordan ham, uzunlik chegarasidan ham o'tadi,
  // lekin bo'limning hech qaysi so'zini mashq qilmaydi.
  it('bo`limning yangi so`zisiz gapni rad etadi', async () => {
    const r = await generateForUnit(model('Wer ist das? | Bu kim?'), {
      allowed: new Set(['anna']),
      newWords: new Set(['anna']),
      words: [],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected[0].reason).toBe('no-new-word');
  });

  it('yangi so`z ishlatgan gapni saqlaydi', async () => {
    const r = await generateForUnit(
      model('Ich heiße Anna. | Mening ismim Anna.'),
      {
        allowed,
        newWords: new Set(['heiße']),
        words: [],
        examples: [],
        count: 1,
      },
    );
    expect(r.kept).toHaveLength(1);
  });

  // Yordamchi so'z bo'lim yozuvida uchrasa ham «yangi» emas.
  it('yordamchi so`zni yangi so`z deb sanamaydi', async () => {
    const r = await generateForUnit(model('Wer ist das? | Bu kim?'), {
      allowed: new Set(),
      newWords: new Set(['das', 'wer', 'ist']),
      words: [],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected[0].reason).toBe('no-new-word');
  });

  // To'g'ridan-to'g'ri `buildSentencePrompt` testi bu sinfni ushlay
  // olmadi: argument uzatilmay qolgan edi va testlar yashil turgan.
  it('tanish so`zlarni generateForUnit orqali ham so`rovga qo`yadi', async () => {
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
      words: ['heißen'],
      knownWords: ['wohnen'],
      examples: [],
      count: 1,
    });
    expect(prompts[0]).toContain('wohnen');
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

describe('materialWords', () => {
  // Model tayyor ifodani gap yasashning o'rniga shundoq qaytarardi.
  it('tayyor ifodani so`rov ro`yxatidan chiqaradi', () => {
    expect(
      materialWords([
        'wohnen',
        'die Unterschrift',
        'Bis nächste Woche.',
        'Wer ist das?',
        'Es ist nett, dich kennen zu lernen',
      ]),
    ).toEqual(['wohnen', 'die Unterschrift']);
  });

  it('gap tinish belgisini ham, uzunlikni ham alomat deb biladi', () => {
    expect(isPhraseEntry('Hallo!')).toBe(true);
    expect(isPhraseEntry('Ich bin Student/Studentin')).toBe(true);
    expect(isPhraseEntry('unterschreiben')).toBe(false);
  });
});

describe('sourceSentences', () => {
  // Bu gaplarni ODAM yozgan — to'plamdagi eng sifatli qism.
  it('lug`at yozuvidan tayyor gapni oladi', () => {
    expect(sourceSentences([{ de: 'Wer ist das?', uz: 'Bu kim?' }])).toEqual([
      { de: 'Wer ist das?', uz: 'Bu kim?', origin: 'SOURCE' },
    ]);
  });

  // «Bis Samstag.» — ikki so'z, mashq uchun juda qisqa.
  it('uch so`zdan qisqa yozuvni olmaydi', () => {
    expect(
      sourceSentences([{ de: 'Bis Samstag.', uz: 'Shanba kuni.' }]),
    ).toEqual([]);
  });

  // Yasalgan gap ikkala chegaradan o'tadi; manbadagisi ham shundan
  // o'tishi kerak, aks holda mashqlar bir xil o'lchovda bo'lmaydi.
  it('yetti so`zdan uzun yozuvni olmaydi', () => {
    expect(
      sourceSentences([
        {
          de: 'Möchtest du Salz oder Zucker auf deinem Popcorn?',
          uz: 'Popkoringizga tuz yoki shakar kerakmi?',
        },
      ]),
    ).toEqual([]);
  });

  it('gap tinish belgisisiz yozuvni olmaydi', () => {
    expect(
      sourceSentences([
        { de: 'Ich bin Student/Studentin', uz: 'Men talabaman' },
        { de: 'das Land (die Länder)', uz: 'mamlakat' },
      ]),
    ).toEqual([]);
  });

  // Tarjima o'rnida nemischaning o'zi turgan 12 gap faylga o'tib
  // ketgan edi — o'quvchi «qora» o'rniga `schwarz` ko'rardi.
  it('tarjimasi nemischaning nusxasi bo`lgan yozuvni olmaydi', () => {
    expect(
      sourceSentences([{ de: 'Wie geht es Ihnen?', uz: 'Wie geht es Ihnen?' }]),
    ).toEqual([]);
  });

  it('kichik harf bilan boshlangan parchani olmaydi', () => {
    expect(
      sourceSentences([
        { de: 'an welchem Tag?', uz: 'qaysi kuni?' },
        { de: 'eine Kugel Vanillaeis, bitte!', uz: 'bir shar muzqaymoq!' },
      ]),
    ).toEqual([]);
  });

  it('lug`at artefaktini olmaydi', () => {
    expect(
      sourceSentences([
        { de: 'verrückt - Du bist ja verrückt!', uz: 'sen aqldan ozgansan!' },
        { de: 'Wie viet kostet....?', uz: 'narxi qancha?' },
      ]),
    ).toEqual([]);
  });

  // Qoida ilgari faqat `generateForUnit` da turardi.
  it('bo`limning yangi so`zisiz manba gapini olmaydi', () => {
    expect(
      sourceSentences(
        [{ de: 'Wer ist das?', uz: 'Bu kim?' }],
        new Set(['anna']),
      ),
    ).toEqual([]);
  });

  it('yangi so`zi bor manba gapini oladi', () => {
    expect(
      sourceSentences(
        [{ de: 'Wer ist Anna?', uz: 'Anna kim?' }],
        new Set(['anna']),
      ),
    ).toEqual([{ de: 'Wer ist Anna?', uz: 'Anna kim?', origin: 'SOURCE' }]);
  });

  it('tarjimasi yo`q yozuvni olmaydi', () => {
    expect(sourceSentences([{ de: 'Wer ist das?', uz: null }])).toEqual([]);
  });

  // «A / B» — ikki variant; birinchisi olinadi.
  it('birinchi variantni oladi', () => {
    expect(
      sourceSentences([
        { de: 'Wie heißt du? / Wie ist dein Name?', uz: 'Ismingiz nima?' },
      ]),
    ).toEqual([
      { de: 'Wie heißt du?', uz: 'Ismingiz nima?', origin: 'SOURCE' },
    ]);
  });

  // Qiyshiq chiziq gap ICHIDA turgan yozuv bo'lingani parcha berardi.
  it('bo`lingani gap bo`lmasa olmaydi', () => {
    expect(
      sourceSentences([
        { de: 'Es ist nett, dich / Sie kennen zu lernen', uz: 'Yoqimli.' },
      ]),
    ).toEqual([]);
  });

  // Ixtiyoriy bo'lakli yozuv bitta aniq gap emas, va manba matni
  // jimgina tahrirlanmaydi.
  it('qavsli yozuvni olmaydi', () => {
    expect(
      sourceSentences([{ de: '(Es) tut mir leid.', uz: 'Afsusdaman.' }]),
    ).toEqual([]);
  });
});
