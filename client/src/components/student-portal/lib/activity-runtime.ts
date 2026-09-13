import { seansIdYarat } from "../lernen/seans-navbat";
import { anyMediaPlaying } from "./media-registry";
import { radioOvozHolati } from "./radio-store";
import {
  boshlangichHolat,
  payloadFor,
  tick,
  yangiSeans,
  yuborishgaArziydi,
  type TrackerHolati,
} from "./activity-tracker";
import {
  joriyniOchir,
  joriyniOqi,
  joriyniSaqla,
  kutilmoqdaOchir,
  kutilmoqdaOqi,
  kutilmoqdaQosh,
  xotiraSaqlagichi,
  type Saqlagich,
} from "./activity-storage";
import { yubor } from "./activity-sender";

/**
 * `window.localStorage`ga murojaatning o'zi ba'zi brauzerlarda (qattiq
 * maxfiylik rejimi, bloklangan sayt ma'lumotlari, ba'zi webview'lar)
 * sinxron `SecurityError` tashlaydi — `try/catch` bilan o'ralmagan getter
 * ekanligi sababli oddiy null-tekshiruv yordam bermaydi. Bunday holatda
 * xotiradagi zaxiraga o'tiladi: hisob shu seans davomida ishlayveradi,
 * faqat sahifa yangilanganda saqlanib qolmaydi — kuzatuvni butunlay
 * o'chirib qo'yish o'rniga.
 */
function xavfsizSaqlagich(): Saqlagich {
  try {
    return window.localStorage;
  } catch {
    return xotiraSaqlagichi();
  }
}

/**
 * Faollik hisobini brauzerga ulaydi (dizayn 4.5): har 1 s o'lchaydi, har 15 s
 * `localStorage` ga, har 60 s va sahifa yashirinayotganda serverga yuboradi.
 * Qaytgan funksiya hammasini to'xtatadi va joriy seansni yopadi (chiqish yoki
 * qobiq yopilishi) — keyingi kirish yangi seans bilan boshlanadi.
 */
const TICK_MS = 1_000;
const SAQLASH_MS = 15_000;
const YUBORISH_MS = 60_000;
const HODISALAR = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;

export function faollikniBoshla(userId: number): () => void {
  const storage = xavfsizSaqlagich();
  let lastInputAt = Date.now();

  const oldingi = joriyniOqi(storage, userId, Date.now());
  if (oldingi.yopilgan && yuborishgaArziydi(oldingi.yopilgan)) {
    kutilmoqdaQosh(storage, payloadFor(oldingi.yopilgan));
  }
  let holat: TrackerHolati = boshlangichHolat(
    oldingi.davom ?? yangiSeans(userId, Date.now(), seansIdYarat()),
    Date.now(),
  );
  joriyniSaqla(storage, holat.seans);

  let kutilganlarYuborilmoqda = false;
  const kutilganlarniYubor = async () => {
    if (kutilganlarYuborilmoqda) return;
    kutilganlarYuborilmoqda = true;
    try {
      for (const p of kutilmoqdaOqi(storage)) {
        if ((await yubor(p)) !== "xato") kutilmoqdaOchir(storage, p.sessionId);
      }
    } finally {
      kutilganlarYuborilmoqda = false;
    }
  };

  let joriyYuborilmoqda = false;
  const joriyniYubor = async () => {
    const seans = holat.seans;
    if (joriyYuborilmoqda || !yuborishgaArziydi(seans)) return;
    joriyYuborilmoqda = true;
    try {
      const natija = await yubor(payloadFor(seans));
      // Server seansni rad etdi (kuni o'tgan yoki begona) — yangi seans ochiladi.
      if (natija === "rad" && holat.seans.sessionId === seans.sessionId) {
        holat = boshlangichHolat(yangiSeans(userId, Date.now(), seansIdYarat()), Date.now());
        joriyniSaqla(storage, holat.seans);
      }
    } finally {
      joriyYuborilmoqda = false;
    }
  };

  const belgila = () => {
    lastInputAt = Date.now();
  };

  const tickTaymer = window.setInterval(() => {
    const natija = tick(
      holat,
      {
        now: Date.now(),
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        lastInputAt,
        mediaPlaying: anyMediaPlaying(),
        pathname: window.location.pathname,
        radio: radioOvozHolati(),
      },
      seansIdYarat,
    );
    holat = natija.holat;
    if (natija.yopilgan) {
      if (yuborishgaArziydi(natija.yopilgan)) {
        kutilmoqdaQosh(storage, payloadFor(natija.yopilgan));
        void kutilganlarniYubor();
      }
      joriyniSaqla(storage, holat.seans);
    }
  }, TICK_MS);

  const saqlashTaymer = window.setInterval(() => joriyniSaqla(storage, holat.seans), SAQLASH_MS);
  const yuborishTaymer = window.setInterval(() => void joriyniYubor(), YUBORISH_MS);

  const yashirinish = () => {
    if (document.visibilityState !== "hidden") return;
    joriyniSaqla(storage, holat.seans);
    void joriyniYubor();
  };
  const ketish = () => {
    joriyniSaqla(storage, holat.seans);
    if (yuborishgaArziydi(holat.seans)) void yubor(payloadFor(holat.seans));
  };

  for (const h of HODISALAR) {
    window.addEventListener(h, belgila, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", yashirinish);
  window.addEventListener("pagehide", ketish);
  void kutilganlarniYubor();

  return () => {
    window.clearInterval(tickTaymer);
    window.clearInterval(saqlashTaymer);
    window.clearInterval(yuborishTaymer);
    for (const h of HODISALAR) {
      window.removeEventListener(h, belgila, { capture: true });
    }
    document.removeEventListener("visibilitychange", yashirinish);
    window.removeEventListener("pagehide", ketish);
    if (yuborishgaArziydi(holat.seans)) kutilmoqdaQosh(storage, payloadFor(holat.seans));
    joriyniOchir(storage);
    void kutilganlarniYubor();
  };
}
