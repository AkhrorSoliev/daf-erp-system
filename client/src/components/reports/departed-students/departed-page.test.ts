import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/departed-students",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));

type Answer = { data: unknown; isPending: boolean; isError: boolean; isPlaceholderData: boolean; refetch: () => void };
const answers = vi.hoisted(() => ({ overview: null as unknown, list: null as unknown }));
vi.mock("./departed-queries", () => ({
  useDepartedOverview: () => answers.overview,
  useDepartedList: () => answers.list,
  useDepartedFilterOptions: () => ({ data: { courses: [], teachers: [] } }),
}));

import { DepartedStudentsPage } from "./departed-students-page";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const state = (over: Partial<Answer> = {}): Answer => ({ data: undefined, isPending: false, isError: false, isPlaceholderData: false, refetch() {}, ...over });
const render = () =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(TooltipProvider, null, createElement(DepartedStudentsPage))));

// Made-up figures.
const OVERVIEW = {
  range: { startDate: "2026-10-01", endDate: "2026-10-31" },
  previous: { startDate: "2026-09-01", endDate: "2026-09-30" },
  cards: { departed: 12, previousDeparted: 8, atStart: 100, per100: 12, avgStudyMonths: 3.4 },
  pendingToday: 0,
  months: [{ key: "2026-10", departed: 12, provisional: true }],
  reasons: [{ reasonId: "r1", name: "Narx qimmat", count: 12 }],
  cuts: { teacher: [], course: [], group: [], branch: [] },
  uniqueDeparted: 12,
  teacherChange: { totalTeacherChanges: 0, departedAfterTeacherChange: 0 },
  graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
};
const LIST = { data: [], total: 0, page: 1, pageSize: 10, confirmed: 0, returned: 0, pending: 0 };

beforeEach(() => {
  url.search = "";
  answers.overview = state({ isPending: true });
  answers.list = state({ isPending: true });
});

describe("DepartedStudentsPage", () => {
  it("title and the Excel button", () => {
    const text = norm(render());
    expect(text).toContain("Ketgan o'quvchilar");
    expect(text).toContain("Excel");
  });
  it("until the first answer: skeletons, no figures, no error", () => {
    const html = render();
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });
  it("an error: the error text and a retry button instead of the blocks", () => {
    answers.overview = state({ isError: true });
    const text = norm(render());
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
  });
  it("an answer: the cards and the list text, nothing dimmed", () => {
    answers.overview = state({ data: OVERVIEW });
    answers.list = state({ data: LIST });
    const html = render();
    const text = norm(html);
    expect(text).toContain("Oktabrda ketdi");
    expect(text).toContain("12 o'quvchi");
    expect(html).not.toContain("opacity-60");
  });
  it("a kept answer from the other period is dimmed, the list table is inert", () => {
    answers.overview = state({ data: OVERVIEW, isPlaceholderData: true });
    answers.list = state({ data: LIST, isPlaceholderData: true });
    const html = render();
    expect(html).toContain("opacity-60");
    expect(html).toContain("inert");
  });
  it("the settings button is hidden without the capability", () => {
    expect(norm(render())).not.toContain("Ketish sabablarini boshqarish");
  });
});
