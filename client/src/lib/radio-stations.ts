import {
  Newspaper,
  MusicNotes,
  Waveform,
  PianoKeys,
  VinylRecord,
  type Icon,
} from "@/components/student-portal/lumio/icon";
import type { LumioTone } from "@/components/student-portal/lumio/tones";

/**
 * Curated German-language live radio for the student portal.
 *
 * The list is deliberately static. It was built once from the radio-browser.info
 * directory (https://api.radio-browser.info) and every entry was then verified by
 * hand: opened, played, and checked for codec, bitrate and TLS. Keeping it in the
 * bundle rather than fetching the directory at runtime means the page has no
 * upstream dependency, works offline once loaded, and can never render a dead
 * station because a third-party index went down.
 *
 * Hard rules for anything added here:
 *  - `https` only. The portal is served over TLS, so a plain-http stream is
 *    blocked as mixed content and fails silently.
 *  - No HLS (`.m3u8`). Plain `<audio>` cannot play it outside Safari.
 *  - MP3 or AAC only, >= 96 kbps.
 *  - No session tokens in the URL — those expire and the station dies weeks later.
 *
 * `uuid` is the radio-browser station id. It is not used at runtime; it exists so
 * `npm run radio:check` can re-resolve a station whose broadcaster moved CDN.
 */

export type RadioCategoryId = "news" | "pop" | "youth" | "culture" | "oldies";

export interface RadioCategory {
  id: RadioCategoryId;
  /** Tab label. Short — it sits in a horizontal scroller on mobile. */
  label: string;
  /** One line under the section heading. Says who the group is for. */
  blurb: string;
  icon: Icon;
  tone: LumioTone;
}

export interface RadioStation {
  id: string;
  name: string;
  category: RadioCategoryId;
  /** Stream URL. Played directly by the browser — never proxied through us. */
  url: string;
  /** radio-browser station id, for the refresh script. */
  uuid: string;
  codec: "MP3" | "AAC";
  bitrate: number;
  country: "DE" | "AT";
  /** Why a German learner would pick this one. Shown under the station name. */
  note: string;
  /**
   * Speech-heavy: news, interviews, features. These are the stations that
   * actually teach the language, so the UI flags them.
   */
  talk?: boolean;
}

export const RADIO_CATEGORIES: RadioCategory[] = [
  {
    id: "news",
    label: "Yangiliklar",
    blurb: "Gap ko'p, musiqa kam — tilni o'rganish uchun eng foydalisi",
    icon: Newspaper,
    tone: "sky",
  },
  {
    id: "pop",
    label: "Pop va hitlar",
    blurb: "Kundalik jonli nutq, qo'shiqlar orasida qisqa suhbatlar",
    icon: MusicNotes,
    tone: "coral",
  },
  {
    id: "youth",
    label: "Yoshlar",
    blurb: "Zamonaviy so'zlashuv tili va alternativ musiqa",
    icon: Waveform,
    tone: "grape",
  },
  {
    id: "culture",
    label: "Madaniyat",
    blurb: "Klassika, jazz, adabiyot va uzun ko'rsatuvlar",
    icon: PianoKeys,
    tone: "teal",
  },
  {
    id: "oldies",
    label: "Retro",
    blurb: "Eski hitlar va schlager — sekin, tushunarli qo'shiqlar",
    icon: VinylRecord,
    tone: "amber",
  },
];

export const RADIO_STATIONS: RadioStation[] = [
  // --- Yangiliklar / gap ---------------------------------------------------
  {
    id: "dlf",
    name: "Deutschlandfunk",
    category: "news",
    url: "https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3?aggregator=web",
    uuid: "42a73a97-9398-437c-b521-86646a79f82f",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Sof adabiy nemis tili, sekin va tiniq talaffuz. Boshlash uchun eng yaxshisi.",
    talk: true,
  },
  {
    id: "dlf-kultur",
    name: "Deutschlandfunk Kultur",
    category: "news",
    url: "https://st02.sslstream.dlf.de/dlf/02/mid/aac/stream.aac?aggregator=web",
    uuid: "447b5296-56b1-45a7-9eab-f078daf0fd25",
    codec: "AAC",
    bitrate: 96,
    country: "DE",
    note: "Suhbatlar, adabiyot va uzun reportajlar.",
    talk: true,
  },
  {
    id: "ndr-info",
    name: "NDR Info",
    category: "news",
    url: "https://icecast.ndr.de/ndr/ndrinfo/hamburg/mp3/128/stream.mp3?aggregator=web",
    uuid: "bd4b6e6a-37eb-40fd-920c-64e836dc24af",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Shimoliy Germaniya yangiliklari, har soatda sharh.",
    talk: true,
  },
  {
    id: "hr-info",
    name: "hr-iNFO",
    category: "news",
    url: "https://dispatcher.rndfnk.com/hr/hrinfo-sued/mp3/high",
    uuid: "60035159-1931-4de9-a270-15958b071bbb",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Kun bo'yi yangilik va tahlil, Gessen shtatidan.",
    talk: true,
  },
  {
    id: "swr-aktuell",
    name: "SWR Aktuell",
    category: "news",
    url: "https://liveradio.swr.de/sw282p3/swraktuell/play.aac",
    uuid: "f1e65b1b-fb00-47a1-8826-eff02dc7fef8",
    codec: "AAC",
    bitrate: 128,
    country: "DE",
    note: "Qisqa va aniq xabarlar — tinglab tushunishni mashq qilishga qulay.",
    talk: true,
  },
  {
    id: "wdr5",
    name: "WDR 5",
    category: "news",
    url: "https://wdr-wdr5-live.icecastssl.wdr.de/wdr/wdr5/live/mp3/128/stream.mp3",
    uuid: "3d4c97c7-e122-4304-b8c8-52336683bda1",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Suhbat va hujjatli ko'rsatuvlar kanali.",
    talk: true,
  },

  // --- Pop / hitlar --------------------------------------------------------
  {
    id: "swr3",
    name: "SWR3",
    category: "pop",
    url: "https://liveradio.swr.de/sw282p3/swr3/play.mp3",
    uuid: "240d28b9-7858-48d2-a816-9cf8e1875fe8",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Germaniyaning eng ko'p tinglanadigan pop kanallaridan biri.",
  },
  {
    id: "bayern3",
    name: "Bayern 3",
    category: "pop",
    url: "https://dispatcher.rndfnk.com/br/br3/live/mp3/mid",
    uuid: "0de82079-04e7-407b-b616-e0726eba5244",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Bavariya hitlari va ertalabki jonli suhbatlar.",
  },
  {
    id: "ndr2",
    name: "NDR 2",
    category: "pop",
    url: "https://icecast.ndr.de/ndr/ndr2/niedersachsen/mp3/128/stream.mp3",
    uuid: "9e3b0f8e-95d3-11e9-a605-52543be04c81",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Pop musiqa va muntazam yangilik bloklari.",
  },
  {
    id: "1live",
    name: "1LIVE",
    category: "pop",
    url: "https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3",
    uuid: "b2cbd1fd-275d-432a-8b20-37dcb3572315",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Yoshlar orasida eng mashhuri, tez va zamonaviy nutq.",
  },
  {
    id: "wdr2",
    name: "WDR 2",
    category: "pop",
    url: "https://wdr-wdr2-rheinland.icecastssl.wdr.de/wdr/wdr2/rheinland/mp3/128/stream.mp3",
    uuid: "e0763f17-a17a-4875-986c-eec1c445c3c1",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Hit musiqa va kun davomida yangiliklar.",
  },
  {
    id: "antenne-bayern",
    name: "ANTENNE BAYERN",
    category: "pop",
    url: "https://stream.antenne.de/antenne/stream/mp3",
    uuid: "d45dff01-bb08-4703-992d-a679a0ba0b05",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Xususiy kanal — reklama va jonli efir ko'p.",
  },
  {
    id: "ffh",
    name: "HIT RADIO FFH",
    category: "pop",
    url: "https://mp3.ffh.de/radioffh/hqlivestream.mp3",
    uuid: "2fd00b8f-3f84-4175-918a-622b114a2fac",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Frankfurt hitlari, yengil kundalik so'zlashuv.",
  },
  {
    id: "oe3",
    name: "Hitradio Ö3",
    category: "pop",
    url: "https://orf-live.ors-shoutcast.at/oe3-q2a",
    uuid: "aac6a88d-ddf1-45f4-8377-3426337c6a6e",
    codec: "MP3",
    bitrate: 192,
    country: "AT",
    note: "Avstriya kanali — avstriya talaffuzini eshitish uchun.",
  },

  // --- Yoshlar / alternativ ------------------------------------------------
  {
    id: "dlf-nova",
    name: "Deutschlandfunk Nova",
    category: "youth",
    url: "https://st03.sslstream.dlf.de/dlf/03/mid/aac/stream.aac?aggregator=web",
    uuid: "495237c6-9daf-49ba-8071-7441a90191e3",
    codec: "AAC",
    bitrate: 128,
    country: "DE",
    note: "Talabalar uchun: fan, jamiyat va qisqa tushuntirishlar.",
    talk: true,
  },
  {
    id: "fm4",
    name: "FM4",
    category: "youth",
    url: "https://orf-live.ors-shoutcast.at/fm4-q1a",
    uuid: "206f93c5-5f3c-4ba1-82c2-19a42582fcc2",
    codec: "MP3",
    bitrate: 128,
    country: "AT",
    note: "Alternativ musiqa, nemis va ingliz tillari aralash.",
  },
  {
    id: "bytefm",
    name: "ByteFM",
    category: "youth",
    url: "https://bytefm.cast.addradio.de/bytefm/main/high/stream",
    uuid: "efcd88c5-cd6f-11e8-a54a-52543be04c81",
    codec: "MP3",
    bitrate: 192,
    country: "DE",
    note: "Mustaqil indie kanali, reklamasiz.",
  },

  // --- Klassika / madaniyat ------------------------------------------------
  {
    id: "br-klassik",
    name: "BR-KLASSIK",
    category: "culture",
    url: "https://dispatcher.rndfnk.com/br/brklassik/live/mp3/high",
    uuid: "29010f42-faef-4a9e-b15c-3ad1613b45cb",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Klassik musiqa — dars tayyorlash va o'qish paytiga.",
  },
  {
    id: "swr2",
    name: "SWR2",
    category: "culture",
    url: "https://liveradio.swr.de/sw331ch/swr2/play.mp3",
    uuid: "5444eb2d-f989-4c1c-a482-ecb8d8f389b2",
    codec: "AAC",
    bitrate: 128,
    country: "DE",
    note: "Madaniyat, klassika va uzun hujjatli eshittirishlar.",
    talk: true,
  },
  {
    id: "wdr3",
    name: "WDR 3",
    category: "culture",
    url: "https://wdr-wdr3-live.icecastssl.wdr.de/wdr/wdr3/live/mp3/256/stream.mp3",
    uuid: "a034d8dc-01bf-4ea7-96ac-66292eff7443",
    codec: "MP3",
    bitrate: 256,
    country: "DE",
    note: "Eng yuqori sifat (256 kbps) — klassika va jazz.",
  },
  {
    id: "hr2",
    name: "hr2-kultur",
    category: "culture",
    url: "https://dispatcher.rndfnk.com/hr/hr2/live/mp3/high",
    uuid: "70614720-560e-4638-913d-0f682d3f9fa7",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Adabiyot, teatr va klassik musiqa.",
    talk: true,
  },
  {
    id: "jazzradio-berlin",
    name: "JazzRadio Berlin",
    category: "culture",
    url: "https://streaming.radio.co/s774887f7b/listen",
    uuid: "abcddf01-9a68-41e9-8d1c-89c35dfdddad",
    codec: "MP3",
    bitrate: 192,
    country: "DE",
    note: "Uzluksiz jazz, deyarli gapsiz — diqqatni buzmaydi.",
  },

  // --- Retro / schlager ----------------------------------------------------
  {
    id: "wdr4",
    name: "WDR 4",
    category: "oldies",
    url: "https://wdr-wdr4-live.icecastssl.wdr.de/wdr/wdr4/live/mp3/128/stream.mp3",
    uuid: "44ee797f-b7c4-4f94-8853-ce9a9c8731ed",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Nemis schlageri va eski hitlar — so'zlari sekin va aniq.",
  },
  {
    id: "bayern1",
    name: "Bayern 1",
    category: "oldies",
    url: "https://dispatcher.rndfnk.com/br/br1/franken/mp3/mid",
    uuid: "3a0985e9-788d-11e8-83fa-52543be04c81",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "Bavariyaning eng katta kanali, oldies va mintaqaviy xabarlar.",
  },
  {
    id: "oldie-antenne",
    name: "OLDIE ANTENNE",
    category: "oldies",
    url: "https://s1-webradio.oldie-antenne.de/oldie-antenne?aw_0_1st.playerid=OldieAntenneWebPlayer",
    uuid: "87906f1e-5f82-4b86-9865-69e8eab8a69a",
    codec: "MP3",
    bitrate: 128,
    country: "DE",
    note: "60-90 yillar xalqaro hitlari.",
  },
  {
    id: "schlagerparadies",
    name: "Schlagerparadies",
    category: "oldies",
    url: "https://webstream.schlagerparadies.de/schlager30842",
    uuid: "9607be6f-0601-11e8-ae97-52543be04c81",
    codec: "MP3",
    bitrate: 192,
    country: "DE",
    note: "Faqat nemis schlageri — qo'shiq matnini ilg'ash oson.",
  },
];

export const STATIONS_BY_ID = new Map(RADIO_STATIONS.map((s) => [s.id, s]));

export function stationsInCategory(id: RadioCategoryId): RadioStation[] {
  return RADIO_STATIONS.filter((s) => s.category === id);
}

export function categoryOf(id: RadioCategoryId): RadioCategory {
  return RADIO_CATEGORIES.find((c) => c.id === id) ?? RADIO_CATEGORIES[0];
}
