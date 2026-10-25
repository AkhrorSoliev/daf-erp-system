export type FrageFormat =
  | 'WORT_UZ'
  | 'UZ_WORT'
  | 'PAAR'
  | 'ARTIKEL'
  | 'LUECKE'
  | 'SATZ_BAUEN'
  | 'SATZ_HOEREN'
  | 'SATZ_UEBERSETZEN'
  | 'REAKTION'
  | 'ZUORDNEN'
  | 'DIALOG_LUECKE'
  | 'AUDIO_WORT'
  | 'WORT_TIPPEN'
  | 'HOEREN_WAHL'
  | 'LESEN_WAHL'
  | 'BILD_WORT'
  | 'AUDIO_BILD'
  | 'BILD_TIPPEN'
  | 'UHR_LESEN'
  | 'UHR_HOEREN'
  | 'UHR_TIPPEN';

export interface MaterialWort {
  id: number;
  de: string;
  uz: string;
  artikel: string | null;
  /** Raqam yoki belgi — so'zning yonida ko'rsatiladi, so'ralmaydi. */
  anzeige: string | null;
  sectionCode: string;
  /** R2 kaliti; `null` — audio hali yasalmagan, audio savol qurilmaydi. */
  audioKey: string | null;
  /**
   * Random R2 key of the word's picture (`daf/bild/<hex>.jpg`); absent or
   * `null` — no picture yet, and no picture question is built.
   */
  imageKey?: string | null;
  /**
   * The picture names this word alone (a bicycle, a bus), so a student may
   * be asked to type the word from it. People and states stay `false`:
   * "die Frau" is a correct name for the grandmother's picture too.
   */
  bildTippen?: boolean;
}

export interface MaterialSatz {
  id: number;
  de: string;
  uz: string;
  sectionCode: string;
  /** Boshqa to'g'ri so'z tartiblari — `SATZ_BAUEN` ularni ham qabul qiladi. */
  akzeptiert: string[];
  /** R2 kaliti; `null` — ovoz yo'q, `SATZ_HOEREN` qurilmaydi. */
  /** Gap qaysi sahnaga tegishli (o'zbekcha, bitta satr); savol oldidan ko'rsatiladi. */
  kontextUz?: string | null;
  audioKey: string | null;
}

export interface MaterialPhrase {
  id: number;
  funktionUz: string;
  de: string;
  uz: string;
  sectionCode: string;
}

/** Dialog ichidagi bitta satr — `dialogLuecke` chalg'ituvchi puli sifatida ham ishlatiladi. */
export interface MaterialDialogZeile {
  id: number;
  sprecher: string;
  de: string;
  uz: string;
  /** Sahna izohi satr yonida (masalan «boshqa xonadan»); o'zbekcha, ixtiyoriy. */
  izohUz?: string | null;
}

/**
 * Savol o'zligining birinchi yarmi — material turi. `Frage.itemType`,
 * DTO'lar, `ladeMaterial` va mijozning `MaterialTyp`i shu BITTA tipdan
 * yuradi: yangi tur qo'shilib bittasida unutilsa kompilyator yiqitadi
 * (`uebung.dto.ts`dagi `Record<ItemType, true>`).
 */
export type ItemType =
  | 'WORT'
  | 'SATZ'
  | 'PHRASE'
  | 'DIALOGZEILE'
  | 'HOERFRAGE'
  | 'UHRZEIT';

/**
 * One clock time a section teaches (`DafUhrzeit`) — the material of the
 * clock formats. `zeit` is the clock face time `HH:MM`, hours 1–12; the
 * German words are made from it (`uhrzeit-text.ts`), never stored.
 */
export interface MaterialUhrzeit {
  id: number;
  zeit: string;
  sectionCode: string;
  /** R2 key of the spoken time; `null` — no audio, no `UHR_HOEREN`. */
  audioKey: string | null;
}

/** Suhbatni eshitgandan keyingi tushunish savoli — `HOEREN_WAHL` materiali. */
export interface MaterialHoerFrage {
  id: number;
  frageDe: string;
  frageUz: string;
  richtig: string;
  falsch: string[];
}

/** Butun dialog — bitta satri bo'shatilib, savolga aylanadi (`DIALOG_LUECKE`). */
export interface MaterialDialog {
  id: number;
  titelDe: string;
  /**
   * Matn turi: `DIALOG`, `ANSAGE` — audio (`HOEREN_WAHL`); `CHAT`, `TEXT`,
   * `TABELLE` — o'qish matni (`LESEN_WAHL`). Yozilmasa — `DIALOG`.
   */
  art?: string;

  zeilen: MaterialDialogZeile[];
  /** Suhbat qayerda, kim bilan boshlanishi — o'zbekcha, ixtiyoriy. */
  sahnaUz?: string | null;
  sectionCode: string;
  /** Butun suhbatning R2 kaliti; `null` — ovoz yo'q, eshitish savoli qurilmaydi. */
  audioKey: string | null;
  /**
   * R2 key of the one picture that shows the whole story; absent or `null`
   * — no picture. Sent with `DIALOG_LUECKE` (`bildUrl`), and with a
   * `HOEREN_WAHL` only after the answer (`transkriptBild`).
   */
  imageKey?: string | null;
  fragen: MaterialHoerFrage[];
}

/**
 * `LESEN_WAHL` savoli bilan birga yuboriladigan o'qish matni. O'zbekcha
 * tarjimasi YO'Q: u javobdan KEYIN (`pruefen` → `transkript`) ochiladi, aks
 * holda o'quvchi nemischani o'qimay, tarjimani o'qirdi.
 */
export interface Lesetext {
  art: 'CHAT' | 'TEXT' | 'TABELLE';
  titel: string;
  sahnaUz: string | null;
  zeilen: Array<{ sprecher: string; de: string }>;
}

/**
 * Serverdagi to'liq savol — TO'G'RI JAVOB BILAN.
 *
 * `itemType` va `itemId` — savolning o'zligi. Javob kelganda server
 * savolni QAYTA QURMAYDI (dizayn D7): u shu ikki maydon bo'yicha
 * materialni bazadan o'qiydi va to'g'ri javobni qaytadan hisoblaydi.
 * Sabab: qaytariladigan so'zlar har o'quvchida boshqacha, ya'ni savolni
 * qayta qurish uchun kerak bo'ladigan urug' beqaror.
 */
export interface Frage {
  format: FrageFormat;
  itemType: ItemType;
  itemId: number;
  prompt: string;
  /** Qo'shimcha ko'rsatma yoki ko'rgazma (raqam, o'zbekcha tarjima). */
  hilfe: string | null;
  options: string[];
  richtig: string;
  akzeptiert: string[];
  /**
   * Qisqa sarlavha — HOZIRCHA FAQAT `DIALOG_LUECKE` to'ldiradi
   * (`dialog.titelDe`). Savol ekranida ishlatilmaydi (suhbatning o'zi
   * ko'rsatiladi); natija ekrani xato ro'yxatida BUTUN suhbat o'rniga
   * shu qisqa nomni ko'rsatish uchun kerak (ko'rik topilmasi — natija
   * ekrani 300+ belgili prompt/javobni sig'diraolmaydi). Boshqa
   * formatlarda `undefined` — ularning `prompt`i allaqachon qisqa.
   */
  titel?: string | null;
  /**
   * Shu savol "ishlatib qo'yadigan" barcha material kalitlari
   * (`materialSchluessel` shaklida).
   *
   * Ko'pchilik format bitta so'z/gap/iboraga tegishli bo'lgani uchun
   * bu odatda bitta elementli massiv — `itemType:itemId` bilan bir xil.
   * `PAAR` BUNDAN MUSTASNO: u to'rtta so'zni bittada ko'rsatadi va
   * tarjimasini oshkor qiladi, shuning uchun to'rttasini ham shu yerga
   * yozadi. Seans quruvchisi (`baueSeans`) shu ro'yxatga qarab so'z
   * qayta so'ralmasligini ta'minlaydi — faqat `itemType:itemId`ga
   * qaraganda, `PAAR` ichidagi qolgan uch so'z "band" bo'lib qolmas
   * edi va bir seansda ikkinchi marta (masalan alohida savol sifatida)
   * so'ralishi mumkin bo'lardi.
   */
  belegteItems: string[];
  /**
   * Audio formatlarda savolning O'ZI shu manzilda; qolganida `null`.
   *
   * `prompt` audio formatlarda ATAYLAB bo'sh: unda so'z tursa, savol
   * eshitishni emas, o'qishni tekshirardi.
   */
  audioUrl: string | null;
  /**
   * The picture shown with the question: the question itself in
   * `BILD_TIPPEN`, the dialog's picture above a `DIALOG_LUECKE`. Choice
   * formats (`BILD_WORT`, `AUDIO_BILD`) carry their pictures in `options`
   * instead. Never set on `HOEREN_WAHL`: the picture would show answers.
   */
  bildUrl?: string | null;
  /**
   * The clock to draw (`HH:MM`) in `UHR_LESEN` / `UHR_TIPPEN`. Never set on
   * `UHR_HOEREN`: its clocks are the `options`, and this would be the answer.
   */
  uhrzeit?: string | null;
  /** `LESEN_WAHL`: savol bilan birga ko'rsatiladigan matn (chat, e-mail, jadval). */
  lesetext?: Lesetext | null;
  /** Gap sahnasi (`MaterialSatz.kontextUz`): SATZ_* va LUECKE savollarida gap oldida ko'rsatiladi. */
  kontext?: string | null;
}

/** `belegteItems`/seans ichidagi band material kalitini quradi. */
export function materialSchluessel(itemType: ItemType, itemId: number): string {
  return `${itemType}:${itemId}`;
}

/** Mijozga ketadigan savol — to'g'ri javobsiz. */
export interface PublicFrage {
  index: number;
  format: FrageFormat;
  itemType: ItemType;
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  /** `Frage.titel` bilan bir xil — qarang yuqorida. */
  titel?: string | null;
  /** `Frage.audioUrl` bilan bir xil — qarang yuqorida. */
  audioUrl: string | null;
  /** `Frage.bildUrl` — the picture shown with the question. */
  bildUrl?: string | null;
  /** `Frage.uhrzeit` — the clock shown with the question. */
  uhrzeit?: string | null;
  /** `Frage.lesetext` — the text a `LESEN_WAHL` question is about. */
  lesetext?: Lesetext | null;
  /** `Frage.kontext` — the scene line shown before the sentence. */
  kontext?: string | null;
}

export function toPublic(f: Frage, index: number): PublicFrage {
  return {
    index,
    format: f.format,
    itemType: f.itemType,
    itemId: f.itemId,
    prompt: f.prompt,
    hilfe: f.hilfe,
    options: f.options,
    titel: f.titel,
    audioUrl: f.audioUrl,
    bildUrl: f.bildUrl ?? null,
    ...(f.uhrzeit ? { uhrzeit: f.uhrzeit } : {}),
    ...(f.lesetext ? { lesetext: f.lesetext } : {}),
    ...(f.kontext ? { kontext: f.kontext } : {}),
  };
}
