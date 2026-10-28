"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";

/**
 * `GET /students/groups/:id/enroll-today-lesson` (and `todayLesson` of the
 * enroll preview): whether the group's lesson today is already over, so the
 * administrator must say if the student was at it.
 */
export type TodayLesson =
  | { needed: false }
  | {
      needed: true;
      startTime: string;
      endTime: string;
      /** `YYYY-MM-DD`; null when the group has no lesson ahead. */
      nextLessonDate: string | null;
    };

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/**
 * Asks the group for the question and keeps the answer. `startDay` is the
 * picked start day (`YYYY-MM-DD`) or null for "today". `answered` is false
 * while the question is shown and unanswered: the caller keeps its submit
 * button off until then. The server also refuses a missing answer.
 */
export function useTodayLesson(groupId: string | null, startDay: string | null) {
  // The answer belongs to one group and start day; a change of either drops it.
  const key = `${groupId}|${startDay}`;
  const [answer, setAnswer] = useState<{ key: string; value: boolean }>();
  const attended = answer?.key === key ? answer.value : undefined;
  const setAttended = (value: boolean) => setAnswer({ key, value });

  const { data } = useQuery<TodayLesson>({
    queryKey: ["enroll-today-lesson", groupId, startDay],
    enabled: !!groupId,
    queryFn: () =>
      api
        .get<TodayLesson>(`/students/groups/${groupId}/enroll-today-lesson`, {
          params: startDay ? { startDate: startDay } : {},
        })
        .then((r) => r.data),
    staleTime: 0,
    retry: false,
  });

  const question: TodayLesson = groupId && data ? data : { needed: false };
  return {
    question,
    attended,
    setAttended,
    /** False while the question is up and unanswered. */
    answered: !question.needed || attended !== undefined,
    /** Sent to the server only when the question was asked. */
    payload: question.needed && attended !== undefined ? { attendedTodayLesson: attended } : {},
  };
}

export function TodayLessonQuestion({
  question,
  attended,
  onChange,
}: {
  question: TodayLesson;
  attended: boolean | undefined;
  onChange: (attended: boolean) => void;
}) {
  const t = useT();
  if (!question.needed) return null;
  const next = question.nextLessonDate;
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="font-medium text-amber-900 dark:text-amber-200">
        {t("Bugungi dars ({from} – {to}) o'tib bo'ldi. O'quvchi unda bo'ldimi?", {
          from: question.startTime,
          to: question.endTime,
        })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="sm"
          variant={attended === true ? "default" : "outline"}
          onClick={() => onChange(true)}
        >
          {t("Ha, bo'ldi — bugundan hisoblanadi")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={attended === false ? "default" : "outline"}
          disabled={!next}
          onClick={() => onChange(false)}
        >
          {next
            ? t("Yo'q — {date} dan boshlanadi", { date: ddmm(next) })
            : t("Yo'q (keyingi dars yo'q)")}
        </Button>
      </div>
    </div>
  );
}
