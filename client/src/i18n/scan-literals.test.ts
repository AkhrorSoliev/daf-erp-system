import { describe, expect, it } from "vitest";
import { scanI18nCalls } from "./scan-literals";

const NBSP = " ";
const literals = (source: string) => scanI18nCalls(source).literals;

describe("scanI18nCalls: what is recorded", () => {
  it("reads double and single quoted texts, in order, for t and msg", () => {
    expect(literals(`t("Bosh sahifa"); t('Chiqish'); msg("Sozlamalar")`)).toEqual(["Bosh sahifa", "Chiqish", "Sozlamalar"]);
  });

  it("keeps apostrophes inside double quotes and unescapes quotes and backslashes", () => {
    expect(literals(String.raw`t("O'quvchilar")`)).toEqual(["O'quvchilar"]);
    expect(literals(String.raw`t('Ma\'lumot')`)).toEqual(["Ma'lumot"]);
    expect(literals(String.raw`t("u \"yangi\" matn")`)).toEqual(['u "yangi" matn']);
    expect(literals(String.raw`t("a\\b")`)).toEqual(["a\\b"]);
  });

  it("unescapes \\n, \\t, \\uXXXX, \\u{…} and \\xXX into the real characters", () => {
    expect(literals(String.raw`t("a b")`)).toEqual([`a${NBSP}b`]);
    expect(literals(String.raw`t("a\xA0b")`)).toEqual([`a${NBSP}b`]);
    expect(literals(String.raw`t("a\u{A0}b")`)).toEqual([`a${NBSP}b`]);
    expect(literals(String.raw`t("bir\niki\tuch")`)).toEqual(["bir\niki\tuch"]);
  });

  it("reads a text with a placeholder and the call's second argument", () => {
    expect(literals(`t("{n} ta", { n })`)).toEqual(["{n} ta"]);
    expect(literals(`t("{n} ta o'quvchi", { n: students.length })`)).toEqual(["{n} ta o'quvchi"]);
  });

  it("reads a call that spans lines", () => {
    expect(literals(`t(\n  "Saqlash"\n)`)).toEqual(["Saqlash"]);
  });

  it("reads a call inside a template substitution, not the template's own text", () => {
    expect(literals("const s = `ab ${t(\"Ha\")} t('ichida emas')`;")).toEqual(["Ha"]);
  });

  it("finds the calls nested in an unsupported one", () => {
    const scan = scanI18nCalls(`t(ok ? t("Ha") : t("Yo'q"))`);
    expect(scan.literals).toEqual(["Ha", "Yo'q"]);
    expect(scan.unsupported).toHaveLength(1);
  });

  it("does not let an apostrophe in JSX text swallow the next line", () => {
    expect(literals(`<p>Ma'lumot topilmadi</p>\n<b>{t("Keyingi")}</b>`)).toEqual(["Keyingi"]);
  });
});

describe("scanI18nCalls: what is ignored", () => {
  it("ignores .t(…) and i18n.t(…), also across a line break", () => {
    expect(literals(`x.t("a"); i18n.t("b"); i18n\n  .t("c"); i18n?.t("d")`)).toEqual([]);
  });

  it("ignores a name that only ends or starts like t or msg", () => {
    const scan = scanI18nCalls(`const t = tr; format("x"); short("y"); smsg("z"); msgs("w"); t2("v"); _t("u"); $t("s")`);
    expect(scan.literals).toEqual([]);
    expect(scan.unsupported).toEqual([]);
  });

  it("ignores a call inside a line comment and a block comment", () => {
    expect(literals(`// t("a")\nconst x = 1; /* t("b")\n msg("c") */ t("d")`)).toEqual(["d"]);
  });

  it("ignores a t( inside a string or the text of a template", () => {
    expect(literals(`const a = "t('x')"; const b = 't("y")'; const c = \`t("z")\`;`)).toEqual([]);
  });

  it("ignores a quote mark inside a comment", () => {
    expect(literals(`// it's\nt("Bor")`)).toEqual(["Bor"]);
  });
});

describe("scanI18nCalls: the first argument", () => {
  it("allows a name or a member chain in t(…) and records nothing", () => {
    for (const source of [`t(item.title)`, `t(label)`, `t(a?.b.c, { n })`, `t(\n  title,\n)`]) {
      const scan = scanI18nCalls(source);
      expect(scan.literals, source).toEqual([]);
      expect(scan.unsupported, source).toEqual([]);
      expect(scan.badMsg, source).toEqual([]);
    }
  });

  it("calls anything else in t(…) unsupported", () => {
    for (const source of [`t(ok ? "a" : "b")`, "t(`tpl`)", `t("a" + b)`, `t(fn())`, `t(item.title ?? "x")`, `t()`, `t(1)`]) {
      const scan = scanI18nCalls(source);
      expect(scan.unsupported, source).toHaveLength(1);
      expect(scan.badMsg, source).toEqual([]);
    }
  });

  it("calls msg(variable) bad, and msg of anything but a literal unsupported", () => {
    const scan = scanI18nCalls(`msg(variable); msg("a" + "b"); msg(\`x\`); msg("Ok")`);
    expect(scan.badMsg).toHaveLength(3);
    expect(scan.unsupported).toHaveLength(3);
    expect(scan.literals).toEqual(["Ok"]);
  });

  it("gives a short excerpt of the call", () => {
    const scan = scanI18nCalls(`const x = 1;\n  t(cond ? "a very long text that goes on and on and on and on and on and on" : "b")`);
    expect(scan.unsupported).toHaveLength(1);
    expect(scan.unsupported[0].startsWith("t(cond ? ")).toBe(true);
    expect(scan.unsupported[0].length).toBeLessThanOrEqual(80);
  });
});
