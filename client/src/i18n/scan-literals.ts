/**
 * Finds the texts of the `t("…")` and `msg("…")` calls of a source file, for
 * `i18n-coverage.test.ts`. It reads the source character by character, so a
 * comment or the inside of a string is never taken for a call, and a text is
 * recorded the way the program sees it (escapes undone).
 *
 * A call is the name `t` or `msg` that follows no identifier character and no
 * dot, then `(`. Its first argument must be a plain string literal. `t(name)`
 * and `t(item.title)` also pass: the value came from `msg("…")`, which is
 * checked itself. Anything else (a ternary, a template, a sum, a call) cannot
 * be checked, so it is reported: write `ok ? t("Ha") : t("Yo'q")`, one literal
 * call per text.
 *
 * Known limit: a quote mark in JSX text opens a "string" that ends at the end of
 * that line, so a call after such an apostrophe on the same line goes unseen.
 */
export interface I18nScan {
  /** The (unescaped) texts of the calls with a literal first argument. */
  literals: string[];
  /** `msg(…)` calls whose argument is not a string literal. */
  badMsg: string[];
  /** Short excerpts of the calls whose first argument cannot be checked (includes `badMsg`). */
  unsupported: string[];
}

const IDENT_START = /[\p{L}_$]/u;
const IDENT_PART = /[\p{L}\p{N}_$]/u;
const MEMBER_CHAIN = /[\p{L}_$][\p{L}\p{N}_$]*(?:\??\.[\p{L}_$][\p{L}\p{N}_$]*)*/uy;
const EXCERPT_LENGTH = 60;

const SIMPLE_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };

const endOfLine = (src: string, from: number) => {
  const at = src.indexOf("\n", from);
  return at < 0 ? src.length : at;
};

function skipSpace(src: string, from: number): number {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

function followsDot(src: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  return src[i] === ".";
}

function fromHex(hex: string): string {
  const code = /^[0-9a-fA-F]+$/.test(hex) ? parseInt(hex, 16) : NaN;
  return code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** Reads the string literal that starts at `start` (a quote mark); null when it does not close on its line. */
function readString(src: string, start: number): { value: string; end: number } | null {
  const quote = src[start];
  let value = "";
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === quote) return { value, end: i + 1 };
    if (c === "\n") return null;
    if (c !== "\\") {
      value += c;
      continue;
    }
    const escaped = src[++i];
    if (escaped === undefined) return null;
    if (escaped === "u" && src[i + 1] === "{") {
      const close = src.indexOf("}", i);
      if (close < 0) return null;
      value += fromHex(src.slice(i + 2, close));
      i = close;
    } else if (escaped === "u") {
      value += fromHex(src.slice(i + 1, i + 5));
      i += 4;
    } else if (escaped === "x") {
      value += fromHex(src.slice(i + 1, i + 3));
      i += 2;
    } else if (escaped === "\r" && src[i + 1] === "\n") {
      i += 1; // a line continuation
    } else if (escaped !== "\n") {
      value += SIMPLE_ESCAPES[escaped] ?? escaped;
    }
  }
  return null;
}

export function scanI18nCalls(source: string): I18nScan {
  const scan: I18nScan = { literals: [], badMsg: [], unsupported: [] };
  const substitutions: number[] = []; // the brace depth at which each open `${` began
  let depth = 0;

  /** Skips template text from `from`; stops after the closing backtick or inside a `${`. */
  const skipTemplate = (from: number): number => {
    for (let i = from; i < source.length; i++) {
      if (source[i] === "\\") i++;
      else if (source[i] === "`") return i + 1;
      else if (source[i] === "$" && source[i + 1] === "{") {
        substitutions.push(depth);
        return i + 2;
      }
    }
    return source.length;
  };

  /** `name` (t or msg) stands at `at` and ends at `end`. */
  const inspectCall = (name: string, at: number, end: number) => {
    const open = skipSpace(source, end);
    if (source[open] !== "(") return;
    const first = skipSpace(source, open + 1);
    const ch = source[first];
    const endsArgument = (from: number) => [",", ")"].includes(source[skipSpace(source, from)]);

    if (ch === '"' || ch === "'") {
      const text = readString(source, first);
      if (text && endsArgument(text.end)) {
        scan.literals.push(text.value);
        return;
      }
    } else if (name === "t" && ch !== undefined && IDENT_START.test(ch)) {
      MEMBER_CHAIN.lastIndex = first;
      const chain = MEMBER_CHAIN.exec(source);
      if (chain && endsArgument(first + chain[0].length)) return;
    }

    const excerpt = source.slice(at, Math.min(endOfLine(source, at), at + EXCERPT_LENGTH)).trimEnd();
    scan.unsupported.push(excerpt);
    if (name === "msg") scan.badMsg.push(excerpt);
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      i = endOfLine(source, i);
    } else if (c === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close < 0 ? source.length : close + 2;
    } else if (c === '"' || c === "'") {
      i = readString(source, i)?.end ?? endOfLine(source, i);
    } else if (c === "`") {
      i = skipTemplate(i + 1);
    } else if (c === "{") {
      depth++;
      i++;
    } else if (c === "}") {
      if (substitutions.length > 0 && substitutions[substitutions.length - 1] === depth) {
        substitutions.pop();
        i = skipTemplate(i + 1);
      } else {
        depth--;
        i++;
      }
    } else if (IDENT_START.test(c)) {
      let end = i + 1;
      while (end < source.length && IDENT_PART.test(source[end])) end++;
      const name = source.slice(i, end);
      if ((name === "t" || name === "msg") && !followsDot(source, i)) inspectCall(name, i, end);
      i = end;
    } else {
      i++;
    }
  }
  return scan;
}
