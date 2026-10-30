"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  AbschlussErgebnis,
  AttemptResult,
  DrillQuestion,
  DrillResult,
  EslatmalarJavob,
  Fortschritt,
  FrageFormat,
  Guruhlar,
  JangBoshlandi,
  JangHolati,
  JangJavobNatijasi,
  JangYakuni,
  JuftNatija,
  LernenGrammarItem,
  LernenLesson,
  LernenLevel,
  LernenUnit,
  Liga,
  Maqsad,
  MaqsadDarajasi,
  MaterialTyp,
  NishonQatori,
  PruefErgebnis,
  PublicFrage,
  ReytingZeile,
  OeffentlichesProfil,
  SeansYakun,
} from "./types";

const BASE = "/student-portal/lernen";

export function useLernenLevels() {
  return useQuery<LernenLevel[]>({
    queryKey: ["lernen", "levels"],
    queryFn: () => api.get(`${BASE}/levels`).then((r) => r.data),
  });
}

export function useLernenUnit(unitId: number) {
  return useQuery<LernenUnit>({
    queryKey: ["lernen", "unit", unitId],
    queryFn: () => api.get(`${BASE}/units/${unitId}`).then((r) => r.data),
    enabled: Number.isFinite(unitId),
  });
}

export function useLernenLesson(lessonId: number) {
  return useQuery<LernenLesson>({
    queryKey: ["lernen", "lesson", lessonId],
    queryFn: () => api.get(`${BASE}/lessons/${lessonId}`).then((r) => r.data),
    enabled: Number.isFinite(lessonId),
  });
}

export function useLernenGrammar() {
  return useQuery<LernenGrammarItem[]>({
    queryKey: ["lernen", "grammar"],
    queryFn: () => api.get(`${BASE}/grammar`).then((r) => r.data),
  });
}

export function useLernenDrill(lessonId: number) {
  return useQuery<DrillQuestion[]>({
    queryKey: ["lernen", "drill", lessonId],
    queryFn: () =>
      api.get(`${BASE}/lessons/${lessonId}/drill`).then((r) => r.data),
    enabled: Number.isFinite(lessonId),
  });
}

/**
 * Mashq javobini tekshiradi.
 *
 * Mijoz savol O'RNINI va tanlovini yuboradi, to'g'ri javobni bilmaydi —
 * u serverda solishtiriladi.
 */
export function useCheckDrill() {
  return useMutation<
    DrillResult,
    unknown,
    { lessonId: number; index: number; given: string; durationMs?: number }
  >({
    mutationFn: (body) =>
      api.post(`${BASE}/drill/check`, body).then((r) => r.data),
  });
}

/**
 * Urinishni yozadi va natijani qaytaradi.
 *
 * Tekshiruv SERVERDA. Mijoz to'g'ri javobni bilmaydi va bilishi ham
 * kerak emas — u faqat tanlovni yuboradi va javobni oladi.
 */
export function useRecordAttempt() {
  return useMutation<
    AttemptResult,
    unknown,
    { exerciseId: number; given: string; durationMs?: number }
  >({
    mutationFn: (body) =>
      api.post(`${BASE}/attempts`, body).then((r) => r.data),
  });
}

/** Darsning 12 savoli. To'g'ri javoblar ichida YO'Q. */
export function useUebungSeans(lessonId: number) {
  return useQuery(uebungSeansQuery(lessonId));
}

/**
 * `gcTime: 0` — a round is dropped as soon as its screen is left, so opening
 * the lesson again asks the server for a NEW round, unseen words first
 * (ADR-0071). Kept in the cache, the old round came back within five minutes:
 * the same 12 questions under a unit page promising «Yana mashq qilish · N
 * yangi so'z». The round's progress lives in the screen, not in this cache.
 */
export function uebungSeansQuery(lessonId: number) {
  return queryOptions<PublicFrage[]>({
    queryKey: ["lernen", "uebung", lessonId],
    queryFn: () =>
      api.get(`${BASE}/lessons/${lessonId}/uebung`).then((r) => r.data),
    enabled: Number.isFinite(lessonId),
    // Seans holati mijozda; qayta so'rash yangi 12 savol keltirardi va
    // o'quvchining o'rnini yo'qotardi.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });
}

/**
 * Leaving a round marks the word counters stale (ADR-0071): every answer has
 * already written the student's word state, and `abschluss` refreshes the
 * unit page and the path only when a round ends. Nothing refetches here; the
 * page that shows the counter refetches when it opens.
 */
export function sozHisobiniEskirt(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["lernen", "unit"], refetchType: "none" });
  void qc.invalidateQueries({ queryKey: ["lernen", "levels"], refetchType: "none" });
}

/** Javobni tekshiradi. To'g'ri javob FAQAT shu javobda keladi. */
export function usePruefen() {
  return useMutation<
    PruefErgebnis,
    unknown,
    {
      itemType: MaterialTyp;
      itemId: number;
      format: FrageFormat;
      given: string;
      durationMs?: number;
      sessionId?: string;
      questionIndex?: number;
      attemptNo?: 1 | 2;
      lessonId?: number;
    }
  >({
    mutationFn: (body) =>
      api.post(`${BASE}/uebung/check`, body).then((r) => r.data),
  });
}

/**
 * Bitta juftni tekshiradi — jonli javob uchun.
 *
 * `useMutation`, `useQuery` emas: bu imperativ hodisa (o'quvchi juftni
 * bosdi), sahifa yuklanishi emas. Keshga ham tushmaydi — bir xil juftni
 * ikkinchi marta bosish YANGI javob hisoblanadi va serverda yoziladi.
 */
export function useJuftTekshir() {
  return useMutation<
    JuftNatija,
    unknown,
    // `itemType` ATAYLAB `MaterialTyp` dan tor: server faqat shu ikkitasini
    // qabul qiladi (gap va dialog satrida "juft" degan tushuncha yo'q),
    // va tip buni chaqiruv joyidayoq ushlab qolishi kerak.
    {
      itemType: "WORT" | "PHRASE";
      itemId: number;
      format: "PAAR" | "ZUORDNEN";
      chap: string;
      ong: string;
      durationMs?: number;
      sessionId?: string;
      questionIndex?: number;
      attemptNo?: 1 | 2;
      lessonId?: number;
    }
  >({
    mutationFn: (body) => api.post(`${BASE}/uebung/juft`, body).then((r) => r.data),
  });
}

/**
 * Xato javobdan keyingi almashtiruvchi savol — boshqa formatda.
 *
 * `useQuery` emas, `useMutation`: u imperativ chaqiriladi (javob
 * xato bo'lgan paytda), sahifa yuklanganda emas.
 */
export function useErsatz() {
  return useMutation<
    PublicFrage | null,
    unknown,
    { lessonId: number; itemType: MaterialTyp; itemId: number; nichtFormat: FrageFormat }
  >({
    mutationFn: ({ lessonId, itemType, itemId, nichtFormat }) =>
      api
        .get(`${BASE}/lessons/${lessonId}/uebung/ersatz`, {
          params: { itemType, itemId, nichtFormat },
        })
        // `??` EMAS: Nest `null` javobini bo'sh tanaga (`response.send()`
        // argumentsiz) aylantiradi, shuning uchun axios `r.data` ni `""`
        // qilib qaytaradi — `"" ?? null` esa `""` bo'lib qoladi, `null`
        // emas. `||` bo'sh satrni ham, `undefined`ni ham `null`ga
        // aylantiradi, shu bilan e'lon qilingan `PublicFrage | null` tur
        // ishonchli bo'ladi.
        .then((r) => r.data || null),
  });
}

/** Seans tugaganini yozadi va ilgarilash keshini bekor qiladi. */
export function useAbschluss() {
  const qc = useQueryClient();
  return useMutation<
    AbschlussErgebnis,
    unknown,
    {
      lessonId: number;
      richtig: number;
      gesamt: number;
      durationMs?: number;
      sessionId?: string;
    }
  >({
    mutationFn: ({ lessonId, ...body }) =>
      api.post(`${BASE}/lessons/${lessonId}/abschluss`, body).then((r) => r.data),
    // Yo'l va unit sahifalari ilgarilashni ko'rsatadi — usiz o'quvchi
    // orqaga qaytganda keyingi dars hamon qulflangan bo'lib ko'rinardi.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lernen", "levels"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "unit"] });
      // Yo'l tepasidagi chiplar (ball, daraja, reyting) — usiz seans
      // tugagach ular eski qiymatni ko'rsatib qolardi.
      void qc.invalidateQueries({ queryKey: ["lernen", "fortschritt"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
      // Seans oxirida yangi nishon berilgan bo'lishi mumkin.
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
      // Liga xonasi (birinchi seansda qo'shiladi) va guruhlar jadvali.
      void qc.invalidateQueries({ queryKey: ["lernen", "liga"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "guruhlar"] });
      // Takrorlash so'rovi `staleTime: Infinity` bilan abadiy keshda
      // turadi (Fix 3) — bu invalidatsiya bo'lmasa, oddiy DARS seansi
      // ham muddati kelgan so'zlarni "yeb qo'yadi" (Leitner holatini
      // yangilaydi), lekin takrorlash keshi buni bilmay, o'quvchi
      // Takrorlashga kirganda ESKI (endi noto'g'ri) 12 savolni ko'rib
      // qoladi.
      void qc.invalidateQueries({ queryKey: ["lernen", "wiederholung"] });
    },
  });
}

/**
 * Takrorlash seansi yakuni — `DafSession` ni yopadi. `abschluss` dan farqi:
 * dars yo'q, ilgarilash keshi (`levels`/`unit`) o'zgarmaydi; ilgarilash
 * chiplari shu yerda yangilanadi.
 */
export function useWiederholungAbschluss() {
  const qc = useQueryClient();
  return useMutation<SeansYakun, unknown, { sessionId: string }>({
    mutationFn: (body) =>
      api.post(`${BASE}/wiederholung/abschluss`, body).then((r) => r.data),
    // The path's chips must show the new total when the student goes back.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lernen", "fortschritt"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "liga"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "guruhlar"] });
    },
  });
}

/** Yo'l tepasidagi chiplar — daraja, ball, seriya, haftalik o'rin. */
export function useFortschritt() {
  return useQuery<Fortschritt>({
    queryKey: ["lernen", "fortschritt"],
    queryFn: () => api.get(`${BASE}/fortschritt`).then((r) => r.data),
  });
}

/** Boshqa o'quvchining ochiq profili (reyting qatoridan). */
export function useOeffentlichesProfil(id: number) {
  return useQuery<OeffentlichesProfil>({
    queryKey: ["lernen", "profil", id],
    queryFn: () => api.get(`${BASE}/profil/${id}`).then((r) => r.data),
  });
}

/** Guruh yoki markaz bo'yicha haftalik reyting jadvali. */
export function useReyting(scope: "gruppe" | "zentrum") {
  return useQuery<ReytingZeile[]>({
    queryKey: ["lernen", "reyting", scope],
    queryFn: () => api.get(`${BASE}/reyting`, { params: { scope } }).then((r) => r.data),
  });
}

/**
 * Kunlik maqsad darajasini saqlaydi. Javob — yangi maqsad bugungi ball bilan;
 * u yo'l tepasidagi keshga darrov yoziladi (halqa qayta so'rovsiz o'zgaradi).
 */
export function useMaqsadOzgartir() {
  const qc = useQueryClient();
  return useMutation<Maqsad, unknown, MaqsadDarajasi>({
    mutationFn: (daraja) =>
      api.patch(`${BASE}/maqsad`, { daraja }).then((r) => r.data),
    onSuccess: (maqsad) => {
      qc.setQueryData<Fortschritt>(["lernen", "fortschritt"], (old) =>
        old ? { ...old, maqsad } : old,
      );
    },
  });
}

/**
 * Telegram eslatmalari almashtirgichi (spec S4 §7): darrov ko'rinadi
 * (`onMutate`), xato bo'lsa FAQAT `eslatmalar` maydoni qaytadi (boshqa
 * maydonlar — `maqsad`, qayta yuklash — o'zgarmaydi). Bir nechta tez bosish
 * bo'lsa oraliq yozuvlar o'tkazib yuboriladi, oxirgi so'rov tugagach holatni
 * server beradi (`onSettled`). Alohida funksiya — test uni `MutationObserver`
 * bilan hooksiz yurgizadi.
 */
export function eslatmalarMutation(
  qc: QueryClient,
): UseMutationOptions<EslatmalarJavob, unknown, boolean, { oldin?: boolean }> {
  const KEY = ["lernen", "fortschritt"];
  const MUTATION_KEY = ["lernen", "eslatmalar"];
  const yoz = (eslatmalar: boolean | undefined) =>
    qc.setQueryData<Fortschritt>(KEY, (old) => (old ? { ...old, eslatmalar } : old));
  // Mutatsiya o'zi `onSuccess`/`onError`/`onSettled` paytida ham "pending" — shuning uchun `<= 1`.
  const oxirgisi = () => qc.isMutating({ mutationKey: MUTATION_KEY }) <= 1;
  return {
    mutationKey: MUTATION_KEY,
    mutationFn: (yoqilgan) =>
      api.patch<EslatmalarJavob>(`${BASE}/eslatmalar`, { yoqilgan }).then((r) => r.data),
    onMutate: async (yoqilgan) => {
      await qc.cancelQueries({ queryKey: KEY });
      const oldin = qc.getQueryData<Fortschritt>(KEY)?.eslatmalar;
      yoz(yoqilgan);
      return { oldin };
    },
    onError: (_err, _yoqilgan, ctx) => {
      if (oxirgisi() && ctx?.oldin !== undefined) yoz(ctx.oldin);
    },
    onSuccess: (javob) => {
      if (oxirgisi()) yoz(javob.eslatmalar);
    },
    // `void`: RQ `onSettled` qaytargan promise'ni kutadi — sekin `fortschritt` xato xabarini
    // va `isPending` ni kechiktirardi.
    onSettled: () => {
      if (oxirgisi()) void qc.invalidateQueries({ queryKey: KEY });
    },
  };
}

export function useEslatmalarOzgartir() {
  const qc = useQueryClient();
  return useMutation(eslatmalarMutation(qc));
}

/** «Darajam» tabidagi nishonlar — faqat shu bo'lim ko'ringanda so'raladi. */
export function useNishonlar() {
  return useQuery<NishonQatori[]>({
    queryKey: ["lernen", "nishonlar"],
    queryFn: () => api.get(`${BASE}/nishonlar`).then((r) => r.data),
  });
}

/**
 * Jadval har seansda o'zgaradi, shuning uchun kesh qisqa: tablar orasida
 * almashganda qayta so'ramaydi, seans oxirida esa baribir yangilanadi
 * (`useAbschluss` / `useWiederholungAbschluss` bekor qiladi).
 */
const JADVAL_STALE_MS = 30_000;

export function ligaQuery(enabled: boolean = true) {
  return queryOptions({
    queryKey: ["lernen", "liga"],
    queryFn: () => api.get<Liga>(`${BASE}/liga`).then((r) => r.data),
    enabled,
    staleTime: JADVAL_STALE_MS,
  });
}

export function guruhlarQuery(enabled: boolean = true) {
  return queryOptions({
    queryKey: ["lernen", "guruhlar"],
    queryFn: () => api.get<Guruhlar>(`${BASE}/guruhlar`).then((r) => r.data),
    enabled,
    staleTime: JADVAL_STALE_MS,
  });
}

/** «Liga» tabi — `enabled` tab ko'ringandagina `true`. Yozmaydi: xonaga qo'shilish seans oxirida. */
export function useLiga({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery(ligaQuery(enabled));
}

/** «Guruhlar» tabi — markazning haftalik guruhlar jadvali; `enabled` tab ko'ringandagina `true`. */
export function useGuruhlar({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery(guruhlarQuery(enabled));
}

/**
 * Takrorlash seansining savollari.
 *
 * `staleTime: Infinity` va `refetchOnWindowFocus: false` — seans holati
 * mijozda yashaydi, qayta so'rash o'quvchining o'rnini yo'qotardi.
 *
 * `enabled` — `SeansEkrani` bu so'rovni ham, dars so'rovini ham DOIM
 * chaqiradi (React Hooks tartibi shart bo'lgani uchun), faqat `manba`ga
 * mos kelmagani `enabled: false` bilan o'chiriladi. Standart `true` —
 * yagona boshqa chaqiruvchi (`wiederholung/page.tsx`) doim yoqiq kerak.
 */
export function useWiederholung(enabled: boolean = true) {
  return useQuery(wiederholungQuery(enabled));
}

/**
 * `gcTime: 0` for the same reason as a lesson round: invalidating alone left
 * the old questions in the cache, and the next review started from them
 * while the fresh set was still loading.
 */
export function wiederholungQuery(enabled: boolean = true) {
  return queryOptions<PublicFrage[]>({
    queryKey: ["lernen", "wiederholung"],
    queryFn: () => api.get(`${BASE}/wiederholung/uebung`).then((r) => r.data),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });
}

const JANG_HOLATI = ["lernen", "jang", "holat"] as const;

export function useJangHolati() {
  return useQuery<JangHolati>({
    queryKey: JANG_HOLATI,
    queryFn: () => api.get(`${BASE}/jang/holat`).then((r) => r.data),
  });
}

export function useJangBoshla() {
  return useMutation({
    mutationFn: () => api.post<JangBoshlandi>(`${BASE}/jang/boshla`).then((r) => r.data),
  });
}

export function useJangJavob() {
  return useMutation({
    mutationFn: (v: { jangId: number; pozitsiya: number; javob: string }) =>
      api
        .post<JangJavobNatijasi>(`${BASE}/jang/${v.jangId}/javob`, { pozitsiya: v.pozitsiya, javob: v.javob })
        .then((r) => r.data),
  });
}

export function useJangYakun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jangId: number) => api.post<JangYakuni>(`${BASE}/jang/${jangId}/yakun`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: JANG_HOLATI });
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
    },
  });
}

/**
 * /media «O'quvchi kabi o'tib ko'rish» — xodim uchun. O'quvchi hooklarining
 * egizaklari, lekin `/daf/media/...`ga boradi: server seansni o'quvchisiz
 * quradi va javobni HECH NARSA yozmasdan tekshiradi.
 */
const KORIK = "/daf/media";

export function useKorikSeans(lessonId: number) {
  return useQuery(
    queryOptions<PublicFrage[]>({
      queryKey: ["media-korik", lessonId],
      queryFn: () => api.get(`${KORIK}/lessons/${lessonId}/sinov`).then((r) => r.data),
      enabled: Number.isFinite(lessonId),
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: 0,
    }),
  );
}

export function useKorikPruefen() {
  return useMutation<PruefErgebnis, unknown, Parameters<ReturnType<typeof usePruefen>["mutate"]>[0]>({
    mutationFn: (body) => api.post(`${KORIK}/sinov/check`, body).then((r) => r.data),
  });
}

export function useKorikJuft() {
  return useMutation<JuftNatija, unknown, Parameters<ReturnType<typeof useJuftTekshir>["mutate"]>[0]>({
    mutationFn: (body) => api.post(`${KORIK}/sinov/juft`, body).then((r) => r.data),
  });
}

export function useKorikErsatz() {
  return useMutation<PublicFrage | null, unknown, Parameters<ReturnType<typeof useErsatz>["mutate"]>[0]>({
    mutationFn: ({ lessonId, itemType, itemId, nichtFormat }) =>
      api
        .get(`${KORIK}/lessons/${lessonId}/sinov/ersatz`, { params: { itemType, itemId, nichtFormat } })
        // `||`: bo'sh tana `""` bo'lib keladi (`useErsatz`dagi izohga qarang).
        .then((r) => r.data || null),
  });
}
