"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  AttemptResult,
  DrillQuestion,
  DrillResult,
  LernenGrammarItem,
  LernenLesson,
  LernenLevel,
  LernenUnit,
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
