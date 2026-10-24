/**
 * Hint pills on «Boshqa» rows (spec B6 §4.4, CEO decision 5): a keyword in the
 * description suggests another category, or that a salary was entered as an
 * expense (subtracted from profit twice). One hint per row, the costliest
 * mistake first. A wrong hint now and then is accepted. The words live here
 * only; the client maps the code to its text.
 */
export type ExpenseHint = 'SALARY' | 'EQUIPMENT' | 'UTILITIES';

const KEYWORDS: readonly (readonly [ExpenseHint, readonly string[]])[] = [
  [
    'SALARY',
    [
      'oylik',
      'maosh',
      'ish haqi',
      'avans',
      'tozalovchi',
      'farrosh',
      'yordamchi',
      'qorovul',
      'oshpaz',
    ],
  ],
  [
    'EQUIPMENT',
    [
      'stul',
      'stol',
      'kompyuter',
      'noutbuk',
      'printer',
      'mebel',
      'shkaf',
      'doska',
      'proyektor',
      'monitor',
      'konditsioner',
      'televizor',
      'kolonka',
      'mikrofon',
    ],
  ],
  [
    'UTILITIES',
    [
      'internet',
      'svet',
      'elektr',
      'gaz',
      'suv',
      'issiqlik',
      'isitish',
      'hosting',
      'server',
      'domen',
      'chiqindi',
    ],
  ],
];

// From the start of a word, any case: «stul» finds «Stullar», not «pastol».
const PATTERNS = KEYWORDS.map(
  ([hint, words]) =>
    [hint, new RegExp(`(^|[^\\p{L}])(${words.join('|')})`, 'iu')] as const,
);

export function expenseHint(e: {
  category: string;
  description: string | null;
}): ExpenseHint | null {
  if (e.category !== 'OTHER') return null;
  const text = e.description ?? '';
  for (const [hint, pattern] of PATTERNS) if (pattern.test(text)) return hint;
  return null;
}
