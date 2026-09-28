import { windowOpensAt, type LessonWindowState } from "@/lib/lesson-window";

export type WindowBannerTone = "info" | "success" | "warning" | "danger";

/** The one line the attendance screen shows about its window (ADR-0046). */
export function windowBanner(p: {
  state: LessonWindowState;
  startTime: string | null;
  endTime: string | null;
  /** The company's lead (minutes before the start the window opens). */
  opensMinutesBefore?: number;
  isAdmin: boolean;
  isToday: boolean;
  hasAttendance: boolean;
  alreadyTakenForTeacher: boolean;
}): { tone: WindowBannerTone; text: string } | null {
  if (p.state === "before") {
    if (p.isToday && p.startTime) {
      return {
        tone: "info",
        text: `Dars ${p.startTime} da boshlanadi. Davomat ${windowOpensAt(p.startTime, p.opensMinutesBefore)} da ochiladi.`,
      };
    }
    return {
      tone: "info",
      text: "Bu dars hali boshlanmagan. Davomat dars kuni ochiladi.",
    };
  }
  if (p.state === "closed") {
    if (p.hasAttendance) {
      return {
        tone: "success",
        text: "Dars tugagan. Davomat yopilgan: endi uni saytda o'zgartirib bo'lmaydi.",
      };
    }
    return {
      tone: "danger",
      text: "Dars tugadi, davomat olinmadi. Bu dars uchun ustozga ish haqi yozilmadi. Davomatni endi saytda hech kim kirita olmaydi.",
    };
  }
  const end = p.endTime ?? "";
  if (!p.isAdmin) {
    if (p.alreadyTakenForTeacher) {
      return {
        tone: "success",
        text: "Davomat olib bo'lingan. Dars tugaguncha administrator tuzata oladi.",
      };
    }
    return {
      tone: "info",
      text: `Davomatni bir marta olasiz. U ${end} da yopiladi: dars tugaguncha olinmasa, bu dars uchun ish haqi yozilmaydi.`,
    };
  }
  if (p.hasAttendance) {
    return {
      tone: "info",
      text: `Tuzatish ${end} gacha ochiq (dars tugaguncha). Keyin davomat yopiladi: hech kim o'zgartira olmaydi.`,
    };
  }
  return {
    tone: "warning",
    text: `Ustoz hali davomat olmagan. ${end} gacha siz olsangiz, ustoz haqi saqlanib qoladi.`,
  };
}
