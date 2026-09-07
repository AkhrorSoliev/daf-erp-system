import { SeansEkrani } from "@/components/student-portal/lernen/uebung/seans-ekrani";

/**
 * Takrorlash — `lessons/[lessonId]` OSTIDA EMAS, chunki bu seans hech
 * qanday darsga tegishli emas (`daf-portal.controller.ts`dagi
 * `wiederholung/uebung` xuddi shu sabab bilan `lessons/` tashqarisida).
 */
export default function Page() {
  return <SeansEkrani manba="takrorlash" />;
}
