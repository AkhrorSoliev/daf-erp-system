import { describe, expect, it } from "vitest";
import {
  writeOffNoticeCopy,
  type DebtWriteOffEligibilityReason,
} from "./debt-write-off-types";

// Nega shu test bor: client testlari komponent chizmaydi (jsdom ham,
// testing-library ham o'rnatilmagan), shuning uchun oynadagi matn JSX
// ichida qolsa uni hech narsa ushlab turmaydi — sarlavhani qaytarib
// tashlasa ham tsc/eslint/vitest/build yashil qolardi. Matn qarori sof
// funksiyaga chiqarildi va bu yerda qulflanadi.

const ALL_REASONS: DebtWriteOffEligibilityReason[] = [
  "NO_DEBT",
  "NO_ABSENT_IN_CYCLE",
  "DISABLED",
];

describe("writeOffNoticeCopy", () => {
  it("DISABLED — 'o'chirilgan' sarlavhasi, 'shart bajarilmadi' emas", () => {
    expect(writeOffNoticeCopy("DISABLED").heading).toBe(
      "Qarz kechirish o'chirilgan",
    );
  });

  it("DISABLED matni sozlama qayerdaligini ko'rsatadi", () => {
    const { body } = writeOffNoticeCopy("DISABLED");
    expect(body).toContain("Sozlamalar → To'lov");
    expect(body).toContain("Qarz kechirishga ruxsat");
    // Qarz yo'qolmasligi aytilishi shart — CEO qoidasi shu.
    expect(body).toContain("butun tarixi bilan saqlanadi");
  });

  it("NO_ABSENT_IN_CYCLE — eski 'shart bajarilmadi' sarlavhasi saqlanadi", () => {
    const copy = writeOffNoticeCopy("NO_ABSENT_IN_CYCLE");
    expect(copy.heading).toBe("Hisobdan chiqarish sharti bajarilmadi");
    expect(copy.body).toContain("ABSENT");
  });

  it("NO_DEBT ham 'shart bajarilmadi' sarlavhasini oladi", () => {
    expect(writeOffNoticeCopy("NO_DEBT").heading).toBe(
      "Hisobdan chiqarish sharti bajarilmadi",
    );
  });

  it("union'ning har bir a'zosi bo'sh bo'lmagan matn qaytaradi", () => {
    for (const reason of ALL_REASONS) {
      const copy = writeOffNoticeCopy(reason);
      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.body).not.toBe("Sharti bajarilmadi.");
    }
  });

  it("faqat DISABLED alohida sarlavha oladi", () => {
    const disabledHeadings = ALL_REASONS.filter(
      (r) => writeOffNoticeCopy(r).heading === "Qarz kechirish o'chirilgan",
    );
    expect(disabledHeadings).toEqual(["DISABLED"]);
  });

  it("sabab kelmasa umumiy matnga tushadi", () => {
    expect(writeOffNoticeCopy(undefined)).toEqual({
      heading: "Hisobdan chiqarish sharti bajarilmadi",
      body: "Sharti bajarilmadi.",
    });
  });
});
