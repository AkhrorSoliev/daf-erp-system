"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useCan } from "@/hooks/use-permissions";
import { useT } from "@/i18n/context";
import {
  RestoreBarredLessonsDialog,
  type OutstandingBarredLessons,
} from "./restore-barred-lessons-dialog";

interface BarredLessonsResponse {
  enabled: boolean;
  items: OutstandingBarredLessons[];
}

/**
 * Pauzada hisobdan chiqarilgan, qaytishda hali hal qilinmagan kunlar bor
 * o'quvchining profilida (ADR-0142): tepada eslatma va tugma. O'quvchi
 * qaytgan bo'lsa (faol, guruhi bor), oyna profil ochilganda o'zi ochiladi:
 * admin faollashtirgan yoki guruhga qo'shgan zahoti kelgan kunlarni so'raymiz.
 * Hal qilinguncha eslatma qoladi, shuning uchun oynani yopib qo'ysa ham yo'qolmaydi.
 */
export function StudentBarredLessonsPrompt({
  studentId,
  returned,
  onDone,
}: {
  studentId: number;
  /** O'quvchi qaytgan: faol va kamida bitta faol guruhi bor. */
  returned: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const canAsk = useCan(["students.manage", "students.enroll"]);
  const [manualOpen, setManualOpen] = useState(false);
  const [autoClosed, setAutoClosed] = useState(false);

  const { data } = useQuery<BarredLessonsResponse>({
    queryKey: ["student-barred-lessons", studentId],
    enabled: canAsk,
    queryFn: () =>
      api
        .get<BarredLessonsResponse>(`/students/${studentId}/barred-lessons`)
        .then((r) => r.data),
  });

  const items = data?.items ?? [];
  const total = items.reduce((n, i) => n + i.days.length, 0);

  // O'quvchi qaytgan bo'lsa oyna o'zi ochiladi; yopilgach qayta ochilmaydi
  // (eslatma va tugma qoladi).
  const open =
    manualOpen || (returned && !!data?.enabled && total > 0 && !autoClosed);
  const setOpen = (value: boolean) => {
    setManualOpen(value);
    if (!value) setAutoClosed(true);
  };

  if (!canAsk || !data?.enabled || total === 0) return null;

  return (
    <>
      <Alert className="mb-4 border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40">
        <Info className="size-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            {returned
              ? t(
                  "Pauza paytida {n} ta dars hisobdan chiqarilgan. O'quvchi qaytdi: kelgan kunlarni belgilang.",
                  { n: total },
                )
              : t(
                  "Pauza paytida {n} ta dars hisobdan chiqarilgan. O'quvchi qaytganda kelgan kunlarni belgilang.",
                  { n: total },
                )}
          </span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("Kunlarni belgilash")}
          </Button>
        </AlertDescription>
      </Alert>
      <RestoreBarredLessonsDialog
        open={open}
        onOpenChange={setOpen}
        studentId={studentId}
        items={items}
        onDone={onDone}
      />
    </>
  );
}
