"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  AbschlussErgebnis,
  AttemptResult,
  DrillQuestion,
  DrillResult,
  FrageFormat,
  LernenGrammarItem,
  LernenLesson,
  LernenLevel,
  LernenUnit,
  MaterialTyp,
  PruefErgebnis,
  PublicFrage,
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
        .then((r) => r.data ?? null),
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
    },
  });
}
