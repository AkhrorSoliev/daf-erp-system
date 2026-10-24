import { describe, expect, it } from "vitest";
import { paymentsNavItems } from "./payments-nav";

describe("paymentsNavItems", () => {
  it("keeps the order, with «To'lovlar» after «Umumiy ma'lumotlar»", () => {
    expect(paymentsNavItems.map((i) => i.title)).toEqual([
      "Umumiy ma'lumotlar",
      "To'lovlar",
      "Xarajatlar",
      "Ish haqi",
      "Qaytariladigan pul",
      "Qarzdorlik",
      "To'lov tizimlari jurnali",
    ]);
  });

  it("«To'lovlar» opens the list for payments.view; «Kutilyotgan to'lovlar» is gone", () => {
    const item = paymentsNavItems.find((i) => i.title === "To'lovlar");
    expect(item?.url).toBe("/payments/list");
    expect(item?.permission).toBe("payments.view");
    expect(paymentsNavItems.some((i) => i.url === "/payments/pending")).toBe(false);
  });
});
