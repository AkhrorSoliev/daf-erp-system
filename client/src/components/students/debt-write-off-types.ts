// Shared between the remove-from-group dialog and the (future) profile-page
// write-off button. Mirrors the shape returned by:
//   GET /students/:id/enrollments/:enrollmentId/debt-write-off-eligibility

// STUDENT_ATTENDED was removed when eligibility was relaxed — admin now
// makes the call via the UI even when the student attended a few lessons.
// DISABLED — `payment.debtWriteOffEnabled` sozlamasi o'chiq bo'lsa server
// shu sababni qaytaradi: bu "shart bajarilmadi" emas, "bu imkoniyat
// umuman yoqilmagan" degani.
export type DebtWriteOffEligibilityReason =
  | "NO_DEBT"
  | "NO_ABSENT_IN_CYCLE"
  | "DISABLED";

export interface DebtWriteOffEligibilityDetails {
  studentId: number;
  enrollmentId: string;
  groupId: string;
  currentBalance: number;
  enrollmentStatus: "ACTIVE" | "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";
  cycleNumber: number;
  cycleStartIndex: number;
  cyclePresentCount: number;
  cycleLateCount: number;
  cycleAbsentCount: number;
  cycleExcusedCount: number;
  lessonPaymentCount: number;
  perLessonCost: number;
  theoreticalCycleDebt: number;
  // Kept for backward compatibility — equals realDebtAmount.
  suggestedWriteOff: number;
  attendedCost: number;
  absentCost: number;
  realDebtAmount: number;
  totalDebtAmount: number;
  maxWriteOff: number;
}

export interface DebtWriteOffEligibility {
  eligible: boolean;
  reason?: DebtWriteOffEligibilityReason;
  details: DebtWriteOffEligibilityDetails;
}

export interface DebtWriteOffNoticeCopy {
  heading: string;
  body: string;
}

/**
 * "Hisobdan chiqarib bo'lmaydi" xabarining matni.
 *
 * Bu qaror JSX ichida turganida hech qanday test uni ushlab tura olmasdi:
 * client testlari komponent chizmaydi (jsdom/testing-library yo'q), shuning
 * uchun oynadagi sarlavhani qaytarib tashlash gate'ni yashil qoldirardi.
 * Endi qaror sof funksiyada — yonidagi .test.ts uni har ikki tarmoq bo'yicha
 * qulflaydi.
 */
export function writeOffNoticeCopy(
  reason?: DebtWriteOffEligibilityReason,
): DebtWriteOffNoticeCopy {
  // DISABLED — shart bajarilmagani emas, imkoniyatning o'zi o'chirilgani.
  // Shuning uchun unga alohida sarlavha beriladi: "shart bajarilmadi" deyish
  // administratorni davomatni tuzatib ko'rishga undardi, holbuki muammo
  // boshqa joyda — sozlamada.
  const heading =
    reason === "DISABLED"
      ? "Qarz kechirish o'chirilgan"
      : "Hisobdan chiqarish sharti bajarilmadi";

  // STUDENT_ATTENDED endi uniondan olib tashlangan, lekin eski server javobi
  // hali shu sababni qaytarishi mumkin — matni saqlanadi.
  const bodyByReason: Record<string, string> = {
    NO_DEBT:
      "Bu yozuv uchun balans manfiy emas — hisobdan chiqarishga hojat yo'q.",
    STUDENT_ATTENDED:
      "O'quvchi joriy siklda darslarga qatnashgan — bu yozuv qarzi haqiqiy qarz hisoblanadi.",
    NO_ABSENT_IN_CYCLE:
      "Joriy siklda 'ABSENT' (kelmagan) belgilangan davomat yo'q.",
    DISABLED:
      "Qarz kechirish o'chirilgan — qarz butun tarixi bilan saqlanadi. Yoqish: Sozlamalar → To'lov → «Qarz kechirishga ruxsat».",
  };

  return {
    heading,
    body: (reason && bodyByReason[reason]) || "Sharti bajarilmadi.",
  };
}
