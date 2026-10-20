/**
 * Uzbek Latin → Uzbek Cyrillic (the 1995 alphabet), by rule. Good enough for
 * interface text; a word it gets wrong goes into `dictionaries/uz-cyrl.ts`.
 */

const APOSTROPHES = "'ʻʼ‘’`";
const VOWELS = "aeiou";

/** Brand and product words that Uzbek Cyrillic text leaves in Latin (compared in lower case). */
export const KEEP_LATIN: ReadonlySet<string> = new Set([
  "excel",
  "telegram",
  "payme",
  "click",
  "uzum",
  "instagram",
  "google",
  "mock",
  "daftar",
  "daf",
  "sprachzentrum",
  "goethe",
  "deutsch",
  "ios",
  "webhook",
  "externalid",
  // The content seed script is named in Latin in the media empty states.
  "seed",
  // Image format named in the profile photo hint.
  "webp",
]);

const LETTERS: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};

const isApostrophe = (c: string | undefined) => c !== undefined && APOSTROPHES.includes(c);

/** Is the letter before position `i` a vowel? An o followed by an apostrophe is ў, a vowel. */
function prevIsVowel(word: string, lower: string, i: number): boolean {
  if (i === 0) return false;
  if (isApostrophe(word[i - 1])) return i >= 2 && lower[i - 2] === "o";
  return VOWELS.includes(lower[i - 1]);
}

function convertWord(word: string): string {
  const lower = word.toLowerCase();
  let out = "";
  for (let i = 0; i < word.length; ) {
    const lc = lower[i];
    const upper = word[i] !== lc;
    const next = lower[i + 1];
    const put = (cyrillic: string) => (upper ? cyrillic.toUpperCase() : cyrillic);

    if ((lc === "o" || lc === "g") && isApostrophe(word[i + 1])) {
      out += put(lc === "o" ? "ў" : "ғ");
      i += 2;
    } else if (lc === "s" && next === "h") {
      out += put("ш");
      i += 2;
    } else if (lc === "c" && next === "h") {
      out += put("ч");
      i += 2;
    } else if (lc === "t" && next === "s") {
      out += put("ц");
      i += 2;
    } else if (lc === "y" && next !== undefined && "aoue".includes(next) && !(next === "o" && isApostrophe(word[i + 2]))) {
      out += put({ a: "я", o: "ё", u: "ю", e: "е" }[next] as string);
      i += 2;
    } else if (lc === "e") {
      out += put(i === 0 || prevIsVowel(word, lower, i) ? "э" : "е");
      i += 1;
    } else if (isApostrophe(word[i])) {
      out += "ъ";
      i += 1;
    } else {
      const mapped = LETTERS[lc];
      out += mapped ? put(mapped) : word[i];
      i += 1;
    }
  }
  return out;
}

function convertToken(token: string): string {
  const [, lead = "", whole = "", closing = ""] = token.match(/^([’'ʻʼ‘`]*)(.*?)([’'ʻʼ‘`]*)$/) ?? [];
  if (whole === "") return token;
  if (/^[A-Z]{2,}$/.test(whole) || KEEP_LATIN.has(whole.toLowerCase())) return token;

  // A word-final g' or o' is ғ or ў, not a closing quote: one apostrophe stays with the word.
  let core = whole;
  let trail = closing;
  if (trail !== "" && /[goGO]$/.test(core)) {
    core += trail[0];
    trail = trail.slice(1);
  }

  // A brand or an acronym with a suffix (Telegram'ga, SMS'lar): the head stays Latin, the suffix is converted.
  // An all-caps head needs a lower-case suffix, or a shouted word such as TO'LOV would count as an acronym.
  const cut = core.search(/[’'ʻʼ‘`]/);
  if (cut > 0) {
    const head = core.slice(0, cut);
    const suffix = core.slice(cut + 1);
    if (KEEP_LATIN.has(head.toLowerCase()) || (/^[A-Z]{2,}$/.test(head) && /[a-z]/.test(suffix))) {
      return `${lead}${head}'${convertWord(suffix)}${trail}`;
    }
  }

  // An acronym with a suffix and no apostrophe (PDFni, SMSlar).
  const acronym = core.match(/^([A-Z]{2,})([a-z]+)$/);
  if (acronym) return `${lead}${acronym[1]}${convertWord(acronym[2])}${trail}`;

  return lead + convertWord(core) + trail;
}

// Order matters: a placeholder, a url, an e-mail, a handle and a level code (A1, B2, C1) are matched before a word.
const TOKEN = /(\{[^}]*\}|https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|@\w+|\b[A-Z]\d+\b|[A-Za-z’'ʻʼ‘`]+)/g;

export function toCyrillic(latin: string): string {
  return latin.replace(TOKEN, (token) => {
    if (/^[{@]|^https?:\/\/|^[A-Z]\d+$/.test(token) || token.includes("@")) return token;
    return convertToken(token);
  });
}
