import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { mlnText } from "@/components/reports/center-activity/center-activity-format";
import {
  TONE_BAR, cardTitle, creditText, hiddenText, lessonsText, pctText, previousText, rateTone, streakText, unchargedText, weekdayName,
} from "./attendance-format";

describe("attendance-format", () => {
  it("pctText shows the server's one-decimal figure whole, «—» for none", () => {
    expect(pctText(81.4)).toBe("81%");
    expect(pctText(80.5)).toBe("81%");
    expect(pctText(0)).toBe("0%");
    expect(pctText(null)).toBe("—");
  });

  it("rateTone: below 80 yellow, below 75 red, on the one-decimal figure", () => {
    expect(rateTone(74.9)).toBe("bad");
    expect(rateTone(75)).toBe("warn");
    expect(rateTone(79.9)).toBe("warn");
    expect(rateTone(80)).toBe("good");
    expect(rateTone(null)).toBe("none");
    expect(Object.values(TONE_BAR).join(" ")).not.toMatch(/amber|sky|hsl\(/);
  });

  it("weekday names are full, for screen readers too", () => {
    expect(weekdayName(1)).toBe("Dushanba");
    expect(weekdayName(6)).toBe("Shanba");
    expect(weekdayName(7)).toBe("Yakshanba");
  });

  it("the card's title names a whole month only", () => {
    expect(cardTitle({ startDate: "2026-09-01", endDate: "2026-09-30" })).toBe("Sentabr davomati");
    expect(cardTitle({ startDate: "2026-10-05", endDate: "2026-10-11" })).toBe("Davomat");
  });

  it("previousText: «avgustda 79% edi», nothing without an earlier figure", () => {
    expect(previousText("current_month", { startDate: "2026-08-01", endDate: "2026-08-31" }, 79)).toBe("avgustda 79% edi");
    expect(previousText("3m", { startDate: "2026-05-01", endDate: "2026-07-31" }, 70.6)).toBe("oldingi 3 oyda 71% edi");
    expect(previousText("current_month", null, null)).toBeNull();
    expect(previousText("current_month", { startDate: "2026-08-01", endDate: "2026-08-31" }, null)).toBeNull();
  });

  it("lessonsText reads «N darsdan M tasiga»", () => {
    expect(lessonsText(4814, 3897)).toBe(`o'tilishi kerak bo'lgan ${formatNumber(4814)} darsdan ${formatNumber(3897)} tasiga kelishgan`);
  });

  it("creditText: the estimate, the switched-off setting, nothing excused", () => {
    expect(creditText({ lessons: 27, students: 25, amount: 970_000, enabled: true, uncharged: 0 })).toBe(
      `27 ta sababli dars (25 o'quvchi) uchun keyingi oy to'lovidan taxminan ${mlnText(970_000)} chegiriladi.`,
    );
    expect(creditText({ lessons: 27, students: 25, amount: null, enabled: false, uncharged: 0 })).toBe(
      "27 ta sababli dars (25 o'quvchi). Sababli dars chegirmasi o'chirilgan.",
    );
    expect(creditText({ lessons: 0, students: 0, amount: 0, enabled: true, uncharged: 0 })).toBe("Bu davrda oylik kurslarda sababli dars yo'q.");
  });

  it("the small notes say nothing when there is nothing", () => {
    expect(unchargedText(3)).toBe("Shundan 3 tasining oyi hali hisoblanmagan, summaga kirmadi.");
    expect(unchargedText(0)).toBeNull();
    expect(hiddenText(4, 60)).toBe("4 ta qatorda yozuv kam (60 tadan kam), ro'yxatda yo'q.");
    expect(hiddenText(0, 60)).toBeNull();
    expect(streakText(18)).toBe("18 o'quvchi 3 va undan ko'p darsga ketma-ket sababsiz kelmadi.");
  });
});
