/**
 * Ilova faolligini o'lchash — SOF modul (dizayn 3 va 4.5). Brauzer API'lariga
 * tegmaydi: har soniyadagi holatni (`TickKirish`) oladi va yangi holat qaytaradi.
 * Brauzer bilan bog'lash `activity-runtime.ts` da.
 *
 * FAOL VAQT = ekran ko'rinib turibdi VA oyna fokusda VA (oxirgi 2 daqiqada
 * teginish/bosish/klaviatura/aylantirish bo'lgan YOKI ta'lim audiosi o'ynayapti).
 * Ikki ochiq tab vaqtni ikki marta sanamaydi — fokus faqat bittasida.
 *
 * RADIO VAQTI = pleyer pozitsiyasining o'sishi; faol vaqtga qo'shilmaydi.
 */
export type Bolim = "LERNEN" | "OTHER";

export const FAOLSIZLIK_MS = 120_000;
export const TICK_QIRQISH_MS = 5_000;
export const SEANS_TANAFFUSI_MS = 30 * 60_000;
const TOSHKENT_SILJISHI_MS = 5 * 60 * 60 * 1000;

export interface FaollikSeansi {
  sessionId: string;
  userId: number;
  /** Seans boshlangan Toshkent kuni, 'YYYY-MM-DD'. */
  kun: string;
  activeMs: number;
  radioMs: number;
  sections: Record<Bolim, number>;
  /** Oxirgi faol soniya yoki radio eshitilgan payt (ms). */
  lastActiveAt: number;
}

export interface TrackerHolati {
  seans: FaollikSeansi;
  lastTickAt: number;
  lastRadioPos: number | null;
}

export interface TickKirish {
  now: number;
  visible: boolean;
  focused: boolean;
  lastInputAt: number;
  mediaPlaying: boolean;
  pathname: string;
  radio: { position: number; audible: boolean } | null;
}

export interface TickNatija {
  holat: TrackerHolati;
  /** Shu tickda yopilgan seans — yakuniy yuborish uchun. */
  yopilgan: FaollikSeansi | null;
}

export interface FaollikPayload {
  sessionId: string;
  platform: "WEB";
  activeSeconds: number;
  radioSeconds: number;
  sections: { LERNEN: number; OTHER: number };
}

/** Toshkent kuni (UTC+5, yozgi vaqt yo'q). */
export function tashkentKuni(ms: number): string {
  return new Date(ms + TOSHKENT_SILJISHI_MS).toISOString().slice(0, 10);
}

export function bolimFor(pathname: string): Bolim {
  return pathname === "/portal/lernen" || pathname.startsWith("/portal/lernen/")
    ? "LERNEN"
    : "OTHER";
}

export function yangiSeans(userId: number, now: number, sessionId: string): FaollikSeansi {
  return {
    sessionId,
    userId,
    kun: tashkentKuni(now),
    activeMs: 0,
    radioMs: 0,
    sections: { LERNEN: 0, OTHER: 0 },
    lastActiveAt: now,
  };
}

export function boshlangichHolat(seans: FaollikSeansi, now: number): TrackerHolati {
  return { seans, lastTickAt: now, lastRadioPos: null };
}

export function tick(h: TrackerHolati, k: TickKirish, idYarat: () => string): TickNatija {
  const devor = Math.max(0, k.now - h.lastTickAt);
  const qadam = Math.min(devor, TICK_QIRQISH_MS);
  const faol =
    k.visible &&
    k.focused &&
    (k.now - k.lastInputAt <= FAOLSIZLIK_MS || k.mediaPlaying);

  // Radio: pozitsiya o'sishi, lekin o'tgan soat vaqti + 1 s dan ko'p emas.
  // Stansiya almashganda pozitsiya qaytadan boshlanadi — manfiy farq 0.
  let radioQadam = 0;
  if (k.radio && k.radio.audible && h.lastRadioPos !== null) {
    const siljish = (k.radio.position - h.lastRadioPos) * 1000;
    if (siljish > 0) radioQadam = Math.min(siljish, devor + 1000);
  }

  const harakat = (faol && qadam > 0) || radioQadam > 0;
  let seans = h.seans;
  let yopilgan: FaollikSeansi | null = null;

  // Seans faqat harakat qayta boshlanganda almashadi: kun o'zgargan yoki
  // 30 daqiqadan uzoq harakat bo'lmagan.
  if (
    harakat &&
    (tashkentKuni(k.now) !== seans.kun || k.now - seans.lastActiveAt > SEANS_TANAFFUSI_MS)
  ) {
    yopilgan = seans;
    seans = yangiSeans(seans.userId, k.now, idYarat());
  }

  if (harakat) {
    const bolim = bolimFor(k.pathname);
    seans = {
      ...seans,
      activeMs: seans.activeMs + (faol ? qadam : 0),
      radioMs: seans.radioMs + radioQadam,
      sections: faol
        ? { ...seans.sections, [bolim]: seans.sections[bolim] + qadam }
        : seans.sections,
      lastActiveAt: k.now,
    };
  }

  return {
    holat: {
      seans,
      lastTickAt: k.now,
      lastRadioPos: k.radio ? k.radio.position : null,
    },
    yopilgan,
  };
}

export function payloadFor(s: FaollikSeansi): FaollikPayload {
  const sek = (ms: number) => Math.floor(ms / 1000);
  return {
    sessionId: s.sessionId,
    platform: "WEB",
    activeSeconds: sek(s.activeMs),
    radioSeconds: sek(s.radioMs),
    sections: { LERNEN: sek(s.sections.LERNEN), OTHER: sek(s.sections.OTHER) },
  };
}

/** Bo'sh seansni serverga yubormaslik uchun. */
export function yuborishgaArziydi(s: FaollikSeansi): boolean {
  return s.activeMs >= 1000 || s.radioMs >= 1000;
}
