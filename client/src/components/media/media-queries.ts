import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { MediaCoverageOverview } from "./media-coverage-types";
import type { LessonFragen } from "./media-fragen-types";
import type { SectionInhalt } from "./media-inhalt-types";

export function useMediaCoverage() {
  return useQuery({
    queryKey: ["media-coverage"],
    queryFn: () => api.get<MediaCoverageOverview>("/daf/media/coverage").then((r) => r.data),
  });
}

export function useSectionInhalt(sectionId: number) {
  return useQuery({
    queryKey: ["media-inhalt", sectionId],
    queryFn: () =>
      api.get<SectionInhalt>(`/daf/media/sections/${sectionId}/inhalt`).then((r) => r.data),
  });
}

/**
 * `staleTime: Infinity` — ro'yxat har so'rovda variantlarni boshqacha
 * aralashtiradi; qayta yuklansa sahifa ko'z oldida "o'zgarib" qolardi.
 */
export function useLessonFragen(lessonId: number) {
  return useQuery({
    queryKey: ["media-lesson-fragen", lessonId],
    queryFn: () =>
      api.get<LessonFragen>(`/daf/media/lessons/${lessonId}/fragen`).then((r) => r.data),
    staleTime: Infinity,
  });
}
