import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { GroupDrawerContent } from "./group-drawer";
import type { GpGroupResponse } from "./group-payments-types";

const noop = () => {};
const raw = (props: Partial<Parameters<typeof GroupDrawerContent>[0]>) =>
  renderToStaticMarkup(createElement(GroupDrawerContent, { state: "ok", data: undefined, onClose: noop, onRetry: noop, ...props }));
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));

// Made-up group and people.
const DATA: GpGroupResponse = {
  group: { id: "g1", name: "A1-01", course: "Nemis tili A1", teachers: ["Olim Karimov"], deleted: false, closed: false },
  charged: 1_350_000, paid: 540_000, unpaid: 810_000, paidPct: 40,
  students: [
    { id: 10002, firstName: "Ikkinchi", lastName: "Ism", phone: "900000002", charged: 450_000, paid: 0, unpaid: 450_000, status: "tolamagan", mark: "muzlatilgan" },
    { id: 10003, firstName: "Uchinchi", lastName: "Ism", phone: "900000003", charged: 450_000, paid: 90_000, unpaid: 360_000, status: "qisman", mark: "arxivda" },
    { id: 10001, firstName: "Birinchi", lastName: "Ism", phone: "900000001", charged: 450_000, paid: 450_000, unpaid: 0, status: "toladi", mark: null },
  ],
};

describe("GroupDrawerContent (spec B5 §3.6)", () => {
  it("the total box, the students with status, mark and amount", () => {
    const html = raw({ data: DATA });
    const text = norm(html);
    expect(text).toContain(`To'landi 40% · qoldi ${price(810_000)} so'm`);
    expect(text).toContain("O'quvchilar");
    expect(text).toContain("Ikkinchi Ism ID 10002 muzlatilgan to'lamagan");
    expect(text).toContain(`qoldi ${price(450_000)}`);
    expect(text).toContain("Uchinchi Ism ID 10003 arxivda qisman");
    expect(text).toContain(`to'ladi hisoblandi ${price(450_000)}`);
    expect(html).toContain('href="/students/profile/10002"');
    expect(html).not.toContain('href="/students/profile/10003"'); // archived: no link
  });
  it("footer: the group page and the debt page filtered by the group", () => {
    const html = raw({ data: DATA });
    expect(html).toContain('href="/groups/g1"');
    expect(html).toContain('href="/payments/debt?groupIds=g1"');
    expect(norm(html)).toContain("Guruh sahifasi Qarzdorlik");
  });
  it("no group page for a deleted group, no debt link when nothing is left", () => {
    const html = raw({ data: { ...DATA, group: { ...DATA.group, deleted: true }, unpaid: 0 } });
    expect(html).not.toContain("/groups/g1");
    expect(html).not.toContain("/payments/debt");
  });
  it("states: loading, not found, error", () => {
    expect(raw({})).toContain('data-slot="skeleton"');
    const nf = norm(raw({ state: "notFound" }));
    expect(nf).toContain("Bu guruh tanlangan oyda topilmadi");
    expect(nf).toContain("Yopish");
    const err = norm(raw({ state: "error" }));
    expect(err).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(err).toContain("Qayta urinish");
  });
});
