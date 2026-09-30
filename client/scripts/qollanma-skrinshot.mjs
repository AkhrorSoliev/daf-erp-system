#!/usr/bin/env node
/**
 * Qo'llanma skrinshotlari — faqat lokal nusxadan (daf_docs), soxta ma'lumot bilan.
 *
 *   cd server && npm run qollanma:baza     # bazani yig'adi
 *   cd server && npm run qollanma:api      # alohida oynada
 *   cd client && npm run qollanma:klient   # alohida oynada
 *   cd client && npm run qollanma:skrinshot [kadr-nomi]
 *
 * Faqat localhost'ga ulanadi. Tasdiqlash tugmalari bosilmaydi: kadr sahifa va
 * oynani ochadi, elementlarga raqam qo'yadi, rasmga oladi.
 */
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KADRLAR } from "./qollanma-kadrlar.mjs";

const KLIENT = "http://localhost:3000";
const API = "http://localhost:4100/api";
// server/prisma/seed.ts dagi dev parol (seed faqat lokal bazaga yoziladi).
const PAROL = process.env.QOLLANMA_PAROL ?? "123456";
const ILDIZ = path.dirname(fileURLToPath(import.meta.url));
const RASMLAR = path.resolve(ILDIZ, "../public/qollanma/rasmlar");
const STSENARIY = path.resolve(ILDIZ, ".qollanma-stsenariy.json");
// `next dev` qo'yadigan «N» belgisi rasmga tushmasin.
const USLUB = "nextjs-portal { display: none !important; }";

/** Toshkent kalendaridagi joriy oy, "YYYY-MM". */
function toshkentOyi() {
  const qismlar = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const qiymat = (tur) => qismlar.find((q) => q.type === tur).value;
  return `${qiymat("year")}-${qiymat("month")}`;
}

async function stsenariyniOqi() {
  let stsenariy;
  try {
    stsenariy = JSON.parse(await readFile(STSENARIY, "utf8"));
  } catch {
    throw new Error(`${STSENARIY} topilmadi. Avval: cd server && npm run qollanma:baza`);
  }
  // Oylik hisob faqat stsenariy yig'ilgan oyda bor: oy almashgach kadr pul blokini indamay yo'qotadi.
  const hozir = toshkentOyi();
  if (stsenariy.oy !== hozir) {
    throw new Error(
      `Stsenariy boshqa oy uchun yig'ilgan (fayl: ${stsenariy.oy}, hozir: ${hozir}). Qayta yig'ing: cd server && npm run qollanma:baza`,
    );
  }
  return stsenariy;
}

async function kirish(login) {
  const javob = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: KLIENT },
    body: JSON.stringify({ login, password: PAROL }),
  }).catch(() => {
    // Aks holda faqat "fetch failed" chiqadi.
    throw new Error(`${API} ga ulanib bo'lmadi. Avval: cd server && npm run qollanma:api`);
  });
  if (!javob.ok) {
    throw new Error(`${login} kira olmadi (${javob.status}). API daf_docs bilan ishlayaptimi? (npm run qollanma:api)`);
  }
  return javob.json();
}

async function kontekstOch(brauzer, login) {
  const { accessToken, refreshToken, user } = await kirish(login);
  const kontekst = await brauzer.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    // Recharts (`isAnimationActive="auto"`) va CSS o'tishlar rasmga yarim chizilgan holda tushmasin.
    reducedMotion: "reduce",
    locale: "uz-UZ",
    timezoneId: "Asia/Tashkent",
  });
  await kontekst.addCookies([
    { name: "token", value: accessToken, url: KLIENT },
    { name: "refreshToken", value: refreshToken, url: KLIENT },
    { name: "user", value: encodeURIComponent(JSON.stringify(user)), url: KLIENT },
  ]);
  await kontekst.addInitScript(({ companyId }) => {
    localStorage.setItem("theme", "light");
    if (companyId) localStorage.setItem("companyId", String(companyId));
  }, { companyId: user.companyId });
  return kontekst;
}

async function belgilarQoy(sahifa, belgilar) {
  const joylar = [];
  for (const { selector, raqam } of belgilar) {
    const quti = await sahifa.locator(selector).first().boundingBox();
    if (!quti) throw new Error(`Belgi elementi topilmadi: ${selector}`);
    joylar.push({ raqam, x: quti.x + quti.width, y: quti.y });
  }
  await sahifa.evaluate((royxat) => {
    for (const { raqam, x, y } of royxat) {
      const belgi = document.createElement("div");
      belgi.textContent = String(raqam);
      Object.assign(belgi.style, {
        position: "fixed",
        left: `${Math.max(0, x - 12)}px`,
        top: `${Math.max(0, y - 12)}px`,
        width: "24px",
        height: "24px",
        borderRadius: "9999px",
        background: "#2563eb",
        color: "#fff",
        font: "600 13px/24px system-ui, sans-serif",
        textAlign: "center",
        zIndex: "2147483647",
        boxShadow: "0 0 0 2px #fff",
        pointerEvents: "none",
      });
      document.body.appendChild(belgi);
    }
  }, joylar);
}

async function suratgaOl(sahifa, kadr, fayl) {
  if (!kadr.kesish) {
    await sahifa.screenshot({ path: fayl, style: USLUB });
    return;
  }
  const quti = await sahifa.locator(kadr.kesish).first().boundingBox();
  if (!quti) throw new Error(`Kesish elementi topilmadi: ${kadr.kesish}`);
  const chet = 16;
  await sahifa.screenshot({
    path: fayl,
    style: USLUB,
    clip: {
      x: Math.max(0, quti.x - chet),
      y: Math.max(0, quti.y - chet),
      width: quti.width + chet * 2,
      height: quti.height + chet * 2,
    },
  });
}

async function main() {
  const tanlov = process.argv[2];
  const kadrlar = tanlov ? KADRLAR.filter((k) => k.nom === tanlov) : KADRLAR;
  if (kadrlar.length === 0) throw new Error(`Kadr topilmadi: ${tanlov}`);
  const stsenariy = await stsenariyniOqi();
  const brauzer = await chromium.launch();
  try {
    for (const kadr of kadrlar) {
      const kontekst = await kontekstOch(brauzer, kadr.login ?? "ceo");
      const sahifa = await kontekst.newPage();
      const url = typeof kadr.url === "function" ? kadr.url(stsenariy) : kadr.url;
      // "networkidle" ishlamaydi: bildirishnoma SSE oqimi doim ochiq. Tayyorlikni `kutish` belgilaydi.
      await sahifa.goto(`${KLIENT}${url}`, { waitUntil: "load" });
      if (kadr.tayyorla) await kadr.tayyorla(sahifa, stsenariy);
      await sahifa.locator(kadr.kutish).first().waitFor({ state: "visible", timeout: 20_000 });
      await belgilarQoy(sahifa, kadr.belgilar ?? []);
      const fayl = path.join(RASMLAR, `${kadr.nom}.png`);
      await mkdir(path.dirname(fayl), { recursive: true });
      await suratgaOl(sahifa, kadr, fayl);
      console.log(`✓ ${kadr.nom}`);
      await kontekst.close();
    }
  } finally {
    await brauzer.close();
  }
}

main().catch((xato) => {
  console.error(xato instanceof Error ? xato.message : xato);
  process.exit(1);
});
