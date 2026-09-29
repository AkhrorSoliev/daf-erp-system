import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { Screen } from "./lumio";
import type { StudentScheduleItem } from "./lib/types";
import { StudentScheduleView } from "./student-schedule-view";
import { StudentAttendanceHistory } from "./student-attendance-history";
import { StudentFaqPage } from "./student-faq-page";
import { StudentAboutPage } from "./student-about-page";

/** Markup of a page over a cache that already holds these answers. */
function html(
  page: ComponentType,
  answers: ReadonlyArray<readonly [QueryKey, unknown]> = [],
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  for (const [key, data] of answers) client.setQueryData(key, data);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(page)),
  );
}

const NARROW = "md:max-w-[600px]";

const schedule: StudentScheduleItem[] = [
  {
    groupId: 501,
    groupName: "A1-12",
    courseName: "Nemis tili A1",
    exactDays: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ],
    lessonStartTime: "14:00",
    lessonEndTime: "15:30",
    startDate: "2026-09-01",
    endDate: null,
    teachers: [],
    room: null,
  },
];

describe("a narrow portal screen on a wide display", () => {
  // Settings and Profile sat against the left edge of the 980px column with
  // the rest of it empty (review 26.09).
  it("sits in the middle of the column", () => {
    const markup = renderToStaticMarkup(createElement(Screen, { narrow: true }));
    expect(markup).toContain("md:mx-auto");
    expect(markup).toContain(NARROW);
  });

  // Rows stretched to 916px: a date at one edge, its status at the other.
  it.each([
    ["Jadval", StudentScheduleView, [[["student-portal", "schedule"], schedule]]],
    [
      "Davomat",
      StudentAttendanceHistory,
      [[["student-portal", "attendance-history"], []]],
    ],
    ["FAQ", StudentFaqPage, []],
    ["Biz haqimizda", StudentAboutPage, []],
  ] as const)("%s uses the narrow column", (_title, page, answers) => {
    expect(html(page, answers)).toContain(NARROW);
  });

  // With one lesson a day, the lesson sat in the left half of a two-column
  // grid and nothing beside it.
  it("Jadval lists a day's lessons in one column", () => {
    expect(
      html(StudentScheduleView, [[["student-portal", "schedule"], schedule]]),
    ).not.toContain("lg:grid-cols-2");
  });
});
