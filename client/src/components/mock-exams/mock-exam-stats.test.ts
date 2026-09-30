import { describe, expect, it } from "vitest";
import type { MockExamStats } from "./exam-detail-types";
import {
  barPercent,
  channelHint,
  dafHint,
  hasLevels,
  hasTimeChoice,
  levelLabel,
  paidHint,
  resultRows,
  statsMethodLabel,
  timeLabel,
  unpaidHint,
} from "./mock-exam-stats";

const money = {
  paidCount: 48,
  paidSum: 2270000,
  unpaidCount: 21,
  unpaidSum: 1055000,
  cashIntentCount: 14,
  freeCount: 0,
};

describe("mock imtihon statistikasi yozuvlari", () => {
  it("to'lov turlarini o'zbekcha nomlaydi, yozilmaganini taxmin qilmaydi", () => {
    expect(statsMethodLabel("CASH")).toBe("Naqd");
    expect(statsMethodLabel("CLICK")).toBe("Click");
    expect(statsMethodLabel("TRANSFER")).toBe("O'tkazma");
    expect(statsMethodLabel("BALANCE")).toBe("Balansdan (eski)");
    expect(statsMethodLabel("UNKNOWN")).toBe("To'lov turi yozilmagan");
  });

  it("kartalar ostidagi qisqa yozuvlar", () => {
    expect(paidHint(money)).toBe("48 kishi to'lagan");
    expect(paidHint({ ...money, freeCount: 3 })).toBe(
      "48 kishi to'lagan · 3 bepul",
    );
    expect(unpaidHint(money)).toBe("21 kishi · 14 tasi naqd deydi");
    expect(unpaidHint({ ...money, cashIntentCount: 0 })).toBe("21 kishi");
    expect(channelHint({ bot: 58, admin: 11 })).toBe("Botdan 58 · Admin 11");
    expect(dafHint({ student: 49, outsider: 20, converted: 0 })).toBe(
      "DaF emas 20",
    );
    expect(dafHint({ student: 58, outsider: 14, converted: 1 })).toBe(
      "DaF emas 14 (1 tasi keyin o'quvchi bo'ldi)",
    );
  });

  it("darajasiz va vaqt tanlanmagan qatorlarni nomlaydi", () => {
    expect(levelLabel("B1")).toBe("B1");
    expect(levelLabel(null)).toBe("Darajasiz");
    expect(timeLabel("09:00")).toBe("09:00");
    expect(timeLabel(null)).toBe("Tanlanmagan");
  });

  it("daraja va vaqt kartasi faqat ma'nosi bo'lsa chiqadi", () => {
    const base = { levels: [], times: [] } as unknown as MockExamStats;
    expect(
      hasLevels({ ...base, levels: [{ level: null, registered: 5, paid: 2 }] }),
    ).toBe(false);
    expect(
      hasLevels({ ...base, levels: [{ level: "A1", registered: 0, paid: 0 }] }),
    ).toBe(true);
    expect(
      hasTimeChoice({ ...base, times: [{ time: "09:00", registered: 5 }] }),
    ).toBe(false);
    expect(
      hasTimeChoice({
        ...base,
        times: [
          { time: "09:00", registered: 5 },
          { time: "13:00", registered: 2 },
        ],
      }),
    ).toBe(true);
  });

  it("chiziq uzunligi eng ko'p yozilgan darajaga nisbatan", () => {
    expect(barPercent(43, 43)).toBe(100);
    expect(barPercent(12, 43)).toBe(28);
    expect(barPercent(0, 0)).toBe(0);
  });

  it("natija qatorlari: xato va kutilayotgan faqat bo'lsa", () => {
    expect(
      resultRows({
        audience: 61,
        delivered: 18,
        noTelegram: 43,
        failed: 0,
        pending: 0,
      }),
    ).toEqual([
      { label: "Natija olishi kerak", value: 61 },
      { label: "Telegramda yetib bordi", value: 18 },
      { label: "Telegram bog'lanmagan", value: 43 },
    ]);
    expect(
      resultRows({
        audience: 5,
        delivered: 1,
        noTelegram: 2,
        failed: 1,
        pending: 1,
      }).map((r) => r.label),
    ).toEqual([
      "Natija olishi kerak",
      "Telegramda yetib bordi",
      "Telegram bog'lanmagan",
      "Yuborib bo'lmadi",
      "Hali yuborilmagan",
    ]);
  });
});
