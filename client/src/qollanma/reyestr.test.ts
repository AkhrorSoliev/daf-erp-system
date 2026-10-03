import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { tashkentNow } from "@/lib/tashkent-time";
import { bolimlar } from "./bolimlar";
import { sahifalar } from "./sahifalar";
import { haqiqiySanami } from "./sana";
import { yangiliklar } from "./yangiliklar";

const KONTENT = join(__dirname, "kontent");
const PUBLIC = join(__dirname, "..", "..", "public");
const APP = join(__dirname, "..", "app", "(dashboard)");

function mdxFayllari(papka: string): string[] {
  return readdirSync(papka).flatMap((nom) => {
    const yol = join(papka, nom);
    if (statSync(yol).isDirectory()) return mdxFayllari(yol);
    return nom.endsWith(".mdx") ? [yol] : [];
  });
}

function ichidaSahifaBor(papka: string): boolean {
  return readdirSync(papka).some((nom) => {
    const yol = join(papka, nom);
    return nom === "page.tsx" || (statSync(yol).isDirectory() && ichidaSahifaBor(yol));
  });
}

/** Naqsh `src/app/(dashboard)` dagi haqiqiy marshrutga mos keladimi. */
function marshrutBor(naqsh: string): boolean {
  // Faqat yolMosmi tushunadigan shakl: "/" yoki kichik harfli segmentlar, oxirida ixtiyoriy "/*".
  if (!/^\/$|^(\/[a-z0-9-]+)+(\/\*)?$/.test(naqsh)) return false;
  const qismlar = naqsh.replace(/\/\*$/, "").split("/").filter(Boolean);
  const papka = join(APP, ...qismlar);
  if (!naqsh.endsWith("/*")) return existsSync(join(papka, "page.tsx"));
  if (!existsSync(papka)) return false;
  return readdirSync(papka).some((nom) => {
    const yol = join(papka, nom);
    return statSync(yol).isDirectory() && ichidaSahifaBor(yol);
  });
}

const slug = (s: { bolim: string; sahifa: string }) => `${s.bolim}/${s.sahifa}`;
const fayllar = mdxFayllari(KONTENT);

describe("qo'llanma reyestri", () => {
  it("har yozuvning MDX fayli bor", () => {
    const yoq = sahifalar.filter((s) => !existsSync(join(KONTENT, `${slug(s)}.mdx`))).map(slug);
    expect(yoq).toEqual([]);
  });

  it("reyestrda yo'q MDX fayl yo'q", () => {
    const reyestrda = new Set(sahifalar.map(slug));
    const ortiqcha = fayllar.map((f) => relative(KONTENT, f).replace(/\.mdx$/, "")).filter((s) => !reyestrda.has(s));
    expect(ortiqcha).toEqual([]);
  });

  it("slug takrorlanmaydi", () => {
    const hammasi = sahifalar.map(slug);
    expect(hammasi.filter((s, i) => hammasi.indexOf(s) !== i)).toEqual([]);
  });

  it("har sahifaning bo'limi bolimlar.ts da bor", () => {
    const idlar = new Set(bolimlar.map((b) => b.id));
    expect(sahifalar.filter((s) => !idlar.has(s.bolim)).map(slug)).toEqual([]);
  });

  it("maydonlar to'g'ri", () => {
    for (const s of sahifalar) {
      expect(haqiqiySanami(s.yangilangan), `${slug(s)} yangilangan`).toBe(true);
      expect(s.rollar.length, `${slug(s)} rollar`).toBeGreaterThan(0);
      expect(s.qisqacha.trim().length, `${slug(s)} qisqacha`).toBeGreaterThan(0);
      expect(s.sarlavha.trim().length, `${slug(s)} sarlavha`).toBeGreaterThan(0);
      for (const adr of s.adr) expect(adr, `${slug(s)} adr`).toMatch(/^\d{4}$/);
    }
  });

  it("har yo'l naqshi mavjud marshrutga mos keladi", () => {
    const xato = sahifalar.flatMap((s) => s.yollar.filter((n) => !marshrutBor(n)).map((n) => `${slug(s)}: ${n}`));
    expect(xato).toEqual([]);
  });

  it("breadcrumb nomlari to'qnashmaydi", () => {
    // Breadcrumb segment bo'yicha nomlaydi va routeLabels ustun turadi (app-breadcrumb.tsx).
    const bolimIdlar = new Set(bolimlar.map((b) => b.id));
    const xato = sahifalar
      .filter((s) => bolimIdlar.has(s.sahifa) || (routeLabels[s.sahifa] !== undefined && routeLabels[s.sahifa] !== s.sarlavha))
      .map(slug);
    expect(xato).toEqual([]);

    const bolimXato = bolimlar
      .filter((b) => routeLabels[b.id] !== undefined && routeLabels[b.id] !== b.nom)
      .map((b) => b.id);
    expect(bolimXato).toEqual([]);
  });

  it("MDX h1 yozmaydi — sarlavha reyestrdan", () => {
    const xato = fayllar.filter((f) => /^# /m.test(readFileSync(f, "utf8"))).map((f) => relative(KONTENT, f));
    expect(xato).toEqual([]);
  });

  it("MDX'dagi har rasm public/ da bor", () => {
    const xato = fayllar.flatMap((f) => {
      const matn = readFileSync(f, "utf8");
      return [...matn.matchAll(/\/qollanma\/rasmlar\/[^\s"')]+/g)]
        .map((m) => m[0])
        .filter((rasm) => !existsSync(join(PUBLIC, rasm)))
        .map((rasm) => `${relative(KONTENT, f)}: ${rasm}`);
    });
    expect(xato).toEqual([]);
  });

  it("MDX'dagi har /qollanma/<bo'lim>/<sahifa> havolasi reyestrdagi sahifaga olib boradi", () => {
    const bor = new Set(sahifalar.map((s) => `${s.bolim}/${s.sahifa}`));
    const xato = fayllar.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/\]\(\/qollanma\/([a-z0-9-]+)\/([a-z0-9-]+)[)#]/g)]
        .map((m) => `${m[1]}/${m[2]}`)
        .filter((kalit) => !bor.has(kalit))
        .map((kalit) => `${relative(KONTENT, f)}: ${kalit}`),
    );
    expect(xato).toEqual([]);
  });

  it("har <Skrinshot> manbasi /qollanma/rasmlar/ ostida", () => {
    const xato = fayllar.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<Skrinshot[^>]*\ssrc="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((src) => !src.startsWith("/qollanma/rasmlar/"))
        .map((src) => `${relative(KONTENT, f)}: ${src}`),
    );
    expect(xato).toEqual([]);
  });
});

describe("«Nima yangi»", () => {
  it("sana haqiqiy, eng yangisi tepada, havola mavjud sahifaga", () => {
    const reyestrda = new Set(sahifalar.map(slug));
    for (const y of yangiliklar) {
      expect(haqiqiySanami(y.sana), y.sarlavha).toBe(true);
      if (y.sahifa) expect(reyestrda.has(slug(y.sahifa)), y.sarlavha).toBe(true);
    }
    const sanalar = yangiliklar.map((y) => y.sana);
    expect(sanalar).toEqual([...sanalar].sort().reverse());
  });

  it("yozuv to'liq, sana kelajakda emas, bir kunda bir xil sarlavha takrorlanmaydi", () => {
    const bugun = tashkentNow().dateStr;
    for (const y of yangiliklar) {
      expect(y.sarlavha.trim().length, `${y.sarlavha} sarlavha`).toBeGreaterThan(0);
      expect(y.matn.trim().length, `${y.sarlavha} matn`).toBeGreaterThan(0);
      // Bo'sh `rollar: []` yozuvni hech kimga ko'rsatmaydi; "hamma uchun" — rollar yozilmaydi.
      if (y.rollar) expect(y.rollar.length, `${y.sarlavha} rollar`).toBeGreaterThan(0);
      expect(y.sana <= bugun, `${y.sarlavha}: ${y.sana} kelajakda (bugun ${bugun})`).toBe(true);
    }
    // Ro'yxat sahifasi `sana-sarlavha`ni React kaliti qiladi.
    const kalitlar = yangiliklar.map((y) => `${y.sana} ${y.sarlavha}`);
    expect(kalitlar.filter((k, i) => kalitlar.indexOf(k) !== i)).toEqual([]);
  });
});
