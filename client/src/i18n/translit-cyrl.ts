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
    } else if (lc === "y" && next !== undefined && "aoue".includes(next) && !prevIsVowel(word, lower, i) && !(next === "o" && isApostrophe(word[i + 2]))) {
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
  const [, lead = "", core = "", trail = ""] = token.match(/^([’'ʻʼ‘`]*)(.*?)([’'ʻʼ‘`]*)$/) ?? [];
  if (core === "") return token;
  if (/^[A-Z]{2,}$/.test(core) || KEEP_LATIN.has(core.toLowerCase())) return token;
  return lead + convertWord(core) + trail;
}

// Order matters: a placeholder, a url, an e-mail and a handle are matched before a word.
const TOKEN = /(\{[^}]*\}|https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|@\w+|[A-Za-z’'ʻʼ‘`]+)/g;

export function toCyrillic(latin: string): string {
  return latin.replace(TOKEN, (token) => {
    if (/^[{@]|^https?:\/\//.test(token) || token.includes("@")) return token;
    return convertToken(token);
  });
}
