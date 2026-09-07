"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  AbschlussErgebnis,
  AttemptResult,
  DrillQuestion,
  DrillResult,
  Fortschritt,
  FrageFormat,
  LernenGrammarItem,
  LernenLesson,
  LernenLevel,
  LernenUnit,
  MaterialTyp,
  PruefErgebnis,
  PublicFrage,
  ReytingZeile,
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
  return useQuery<PublicFrage[]>({
    queryKey: ["lernen", "uebung", lessonId],
    queryFn: () =>
      api.get(`${BASE}/lessons/${lessonId}/uebung`).then((r) => r.data),
    enabled: Number.isFinite(lessonId),
    // Seans holati mijozda; qayta so'rash yangi 12 savol keltirardi va
    // o'quvchining o'rnini yo'qotardi.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
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
    }
  >({
    mutationFn: (body) =>
      api.post(`${BASE}/uebung/check`, body).then((r) => r.data),
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
    { lessonId: number; richtig: number; gesamt: number; durationMs?: number }
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

/** Yo'l tepasidagi chiplar — daraja, ball, seriya, haftalik o'rin. */
export function useFortschritt() {
  return useQuery<Fortschritt>({
    queryKey: ["lernen", "fortschritt"],
    queryFn: () => api.get(`${BASE}/fortschritt`).then((r) => r.data),
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
  return useQuery<PublicFrage[]>({
    queryKey: ["lernen", "wiederholung"],
    queryFn: () => api.get(`${BASE}/wiederholung/uebung`).then((r) => r.data),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}
