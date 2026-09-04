/**
 * Query-string massivlarini o'qish uchun yagona manba.
 *
 * Filtrlar URL'da vergul bilan keladi (`?teacherIds=10,11,12`), chunki bu
 * odam o'qiy oladigan va nusxa ko'chirib yuboradigan shakl — `teacherIds[]=`
 * takrorlanishidan ko'ra. Bitta qiymat ham, massiv ham (Express bir xil
 * kalitni ikki marta ko'rsa massiv beradi) bir xil natijaga keladi.
 *
 * Bo'sh natija `undefined` qaytaradi, `[]` emas: `[]` "hech narsa mos
 * kelmasin" degani, filtrsizlik esa "hammasi" — ikkovini aralashtirib
 * yuborish filtrni jimgina bo'sh ro'yxatga aylantiradi.
 */
export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  // Query'dan faqat satr, son yoki ularning massivi kelishi mumkin. Boshqa
  // shakl (obyekt) — noto'g'ri so'rov; uni "[object Object]" ga aylantirib
  // filtrga qo'yishdan ko'ra e'tiborsiz qoldirgan yaxshi.
  const parts = Array.isArray(value) ? value : [value];
  const cleaned: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string' && typeof part !== 'number') continue;
    for (const token of String(part).split(',')) {
      const trimmed = token.trim();
      if (trimmed.length > 0) cleaned.push(trimmed);
    }
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Xuddi shu, lekin sonlar uchun. Son bo'lmagan bo'laklar tashlab yuboriladi. */
export function toNumberArray(value: unknown): number[] | undefined {
  const raw = toStringArray(value);
  if (!raw) return undefined;
  const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : undefined;
}

/**
 * Prisma `where` uchun: bitta qiymat bo'lsa `equals`, ko'p bo'lsa `in`.
 *
 * Bitta elementli `in` ham to'g'ri ishlaydi, lekin `equals` reja tuzuvchiga
 * aniqroq va mavjud indekslardan foydalanadi — shuning uchun ajratamiz.
 */
export function equalsOrIn<T>(
  values: T[] | undefined,
): T | { in: T[] } | undefined {
  if (!values || values.length === 0) return undefined;
  return values.length === 1 ? values[0] : { in: values };
}
