import { PrismaService } from '../../prisma/prisma.service';

const TRANSLITERATION_MAP: Record<string, string> = {
  a: 'a', b: 'b', d: 'd', e: 'e', f: 'f', g: 'g',
  h: 'h', i: 'i', j: 'j', k: 'k', l: 'l', m: 'm',
  n: 'n', o: 'o', p: 'p', q: 'q', r: 'r', s: 's',
  t: 't', u: 'u', v: 'v', x: 'x', y: 'y', z: 'z',
  // O'zbek harflari
  "o'": 'o', "g'": 'g',
  sh: 'sh', ch: 'ch', ng: 'ng',
  // Kirill harflari
  '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd',
  '\u0435': 'e', '\u0451': 'yo', '\u0436': 'j', '\u0437': 'z', '\u0438': 'i',
  '\u0439': 'y', '\u043a': 'k', '\u043b': 'l', '\u043c': 'm', '\u043d': 'n',
  '\u043e': 'o', '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't',
  '\u0443': 'u', '\u0444': 'f', '\u0445': 'x', '\u0446': 'ts', '\u0447': 'ch',
  '\u0448': 'sh', '\u0449': 'sh', '\u044a': '', '\u044b': 'i', '\u044c': '',
  '\u044d': 'e', '\u044e': 'yu', '\u044f': 'ya',
  '\u049b': 'q', '\u0493': 'g', '\u04b3': 'h', '\u045e': 'o',
};

function transliterate(text: string): string {
  const lower = text.toLowerCase().trim();
  let result = '';

  for (let i = 0; i < lower.length; i++) {
    // 2 belgili kombinatsiyalarni tekshirish (o', g', sh, ch, ng)
    if (i < lower.length - 1) {
      const twoChar = lower.slice(i, i + 2);
      if (TRANSLITERATION_MAP[twoChar]) {
        result += TRANSLITERATION_MAP[twoChar];
        i++;
        continue;
      }
    }

    const char = lower[i];
    if (TRANSLITERATION_MAP[char]) {
      result += TRANSLITERATION_MAP[char];
    } else if (/[a-z]/.test(char)) {
      result += char;
    }
    // Boshqa belgilar (probel, apostrof, raqamlar) tashlab yuboriladi
  }

  return result;
}

/**
 * Ism va familiyadan unique login generatsiya qiladi.
 * Masalan: "Axror Soliyev" → "ahrorsoliev"
 * Agar mavjud bo'lsa: "ahrorsoliev2847"
 */
export async function generateUniqueLogin(
  firstName: string,
  lastName: string,
  prisma: PrismaService,
): Promise<string> {
  const base = transliterate(firstName) + transliterate(lastName);

  if (!base) {
    // Fallback: random login
    return `user${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // Birinchi bazadan tekshirish
  const exists = await prisma.user.findFirst({ where: { login: base, deletedAt: null } });
  if (!exists) {
    return base;
  }

  // Takrorlanmaslik uchun random 4 xonali raqam qo'shish
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const login = `${base}${suffix}`;
    const taken = await prisma.user.findFirst({ where: { login, deletedAt: null } });
    if (!taken) {
      return login;
    }
  }

  // Juda kam ehtimollik bilan — timestamp bilan
  return `${base}${Date.now().toString().slice(-6)}`;
}

/**
 * 8 belgili random parol generatsiya qiladi (katta/kichik harflar + raqamlar).
 */
export function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;

  // Kamida 1 katta, 1 kichik, 1 raqam
  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  for (let i = 3; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Aralashtirib yuborish
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}
