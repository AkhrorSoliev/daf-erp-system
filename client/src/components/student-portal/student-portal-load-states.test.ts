import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  type QueryKey,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { StudentProfile, StudentScheduleItem } from "./lib/types";
import { StudentScheduleView } from "./student-schedule-view";
import { StudentAttendanceHistory } from "./student-attendance-history";
import { StudentPaymentSummary } from "./student-payment-summary";
import { StudentHomePage } from "./student-home-page";

const SCHEDULE = ["student-portal", "schedule"];
const HISTORY = ["student-portal", "attendance-history"];
const STATS = ["student-portal", "attendance-stats"];
const PROFILE = ["student-portal", "profile"];
const PAYMENTS = ["student-portal", "payments"];

const FAILED = new Error("Network Error");

const profile: StudentProfile = {
  id: 10042,
  firstName: "Aziza",
  lastName: "Karimova",
  phone: "998901234567",
  extraPhone: null,
  parentPhone: null,
  parentName: null,
  telegram: null,
  photo: null,
  balance: -150000,
  status: "ACTIVE",
  login: "aziza",
  date_of_birth: null,
  address: null,
  branches: [{ id: 1, name: "Chilonzor" }],
  groups: [],
};

const EVERY_DAY = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const schedule: StudentScheduleItem[] = [
  {
    groupId: 501,
    groupName: "A1-12",
    courseName: "Nemis tili A1",
    exactDays: EVERY_DAY,
    lessonStartTime: "14:00",
    lessonEndTime: "15:30",
    startDate: "2026-09-01",
    endDate: null,
    teachers: [],
    room: null,
  },
];

/** The query had an answer, and a later refetch of it failed. */
class RefreshFailed {
  constructor(readonly data: unknown) {}
}

/**
 * Renders a page over a cache whose queries have already settled, each with
 * data or with an error, the way a student sees it once the requests are
 * done. `retryOnMount: false` keeps a failed query failed on this render
 * rather than showing it as a fresh load. With `offline`, the browser reports
 * no connection while the page renders, so a query with nothing cached is
 * paused instead of fetching.
 */
async function render(
  page: ComponentType,
  settled: [QueryKey, unknown][],
  { offline = false }: { offline?: boolean } = {},
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  for (const [queryKey, outcome] of settled) {
    if (outcome instanceof RefreshFailed) {
      await client.prefetchQuery({ queryKey, queryFn: () => outcome.data });
      await client
        .fetchQuery({ queryKey, queryFn: () => Promise.reject(FAILED), staleTime: 0 })
        .catch(() => undefined);
      continue;
    }
    await client.prefetchQuery({
      queryKey,
      queryFn: () =>
        outcome instanceof Error ? Promise.reject(outcome) : outcome,
    });
  }
  onlineManager.setOnline(!offline);
  let html: string;
  try {
    html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(page)),
    );
  } finally {
    onlineManager.setOnline(true);
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// Until now a failed request rendered the page's empty state: "no lessons
// this week", "no attendance yet", "no transactions yet". A student offline
// read a free week. The failure has to say so and offer a way back.
describe("a portal screen whose request failed", () => {
  it("Asosiy says it could not load and offers a retry", async () => {
    const text = await render(StudentHomePage, [
      [PROFILE, FAILED],
      [STATS, FAILED],
    ]);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
  });

  it("Jadval says it could not load, not that the week is free", async () => {
    const text = await render(StudentScheduleView, [[SCHEDULE, FAILED]]);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("Bu hafta darslar yo'q");
  });

  it("Davomat says it could not load, not that there is no attendance", async () => {
    const text = await render(StudentAttendanceHistory, [
      [HISTORY, FAILED],
      [STATS, FAILED],
    ]);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("Davomat ma'lumotlari yo'q");
  });

  it("To'lovlar keeps its title and offers a retry when the balance fails", async () => {
    const text = await render(StudentPaymentSummary, [[PROFILE, FAILED]]);
    expect(text).toContain("To'lovlar");
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
  });

  it("To'lovlar says its history could not load, not that it is empty", async () => {
    const text = await render(StudentPaymentSummary, [
      [PROFILE, profile],
      [PAYMENTS, FAILED],
    ]);
    expect(text).toContain("Balans tarixi");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("Hali tranzaksiya yo'q");
  });
});

describe("a portal screen whose request came back empty", () => {
  it("Jadval shows the free week", async () => {
    const text = await render(StudentScheduleView, [[SCHEDULE, []]]);
    expect(text).toContain("Bu hafta darslar yo'q");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });

  it("Davomat shows that nothing is recorded yet", async () => {
    const text = await render(StudentAttendanceHistory, [
      [HISTORY, []],
      [STATS, { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0 }],
    ]);
    expect(text).toContain("Davomat ma'lumotlari yo'q");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });

  it("To'lovlar shows that there are no transactions yet", async () => {
    const text = await render(StudentPaymentSummary, [
      [PROFILE, profile],
      [PAYMENTS, { payments: [], transactions: [] }],
    ]);
    expect(text).toContain("Hali tranzaksiya yo'q");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });
});

// React Query does not start a request while the browser reports no
// connection: the query is paused, which is neither `isLoading` nor
// `isError`. Found in the browser after the checks above passed: offline,
// Davomat still said nothing was recorded. The request loads by itself once
// the connection is back, so there is no button to press.
describe("a portal screen opened with no connection", () => {
  it("Asosiy says there is no connection", async () => {
    const text = await render(StudentHomePage, [], { offline: true });
    expect(text).toContain("Internet aloqasi yo'q");
  });

  it("Jadval says there is no connection, not that the week is free", async () => {
    const text = await render(StudentScheduleView, [], { offline: true });
    expect(text).toContain("Internet aloqasi yo'q");
    expect(text).not.toContain("Bu hafta darslar yo'q");
    expect(text).not.toContain("Qayta urinish");
  });

  it("Davomat says there is no connection, not that there is no attendance", async () => {
    const text = await render(StudentAttendanceHistory, [], { offline: true });
    expect(text).toContain("Internet aloqasi yo'q");
    expect(text).not.toContain("Davomat ma'lumotlari yo'q");
  });

  it("To'lovlar keeps its title when the balance cannot load", async () => {
    const text = await render(StudentPaymentSummary, [], { offline: true });
    expect(text).toContain("To'lovlar");
    expect(text).toContain("Internet aloqasi yo'q");
  });

  it("To'lovlar says its history needs a connection, not that it is empty", async () => {
    const text = await render(StudentPaymentSummary, [[PROFILE, profile]], {
      offline: true,
    });
    expect(text).toContain("Balans tarixi");
    expect(text).toContain("Internet aloqasi yo'q");
    expect(text).not.toContain("Hali tranzaksiya yo'q");
  });
});

// Once a screen has an answer, a failed background refetch must not replace
// it with an error: the student would lose what they were already reading.
describe("a portal screen whose refresh failed after it had loaded", () => {
  it("Asosiy keeps the dashboard", async () => {
    const text = await render(StudentHomePage, [
      [PROFILE, new RefreshFailed(profile)],
      [STATS, FAILED],
    ]);
    expect(text).toContain("Aziza");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });

  it("Jadval keeps the lessons it already had", async () => {
    const text = await render(StudentScheduleView, [
      [SCHEDULE, new RefreshFailed(schedule)],
    ]);
    expect(text).toContain("A1-12");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });

  it("To'lovlar keeps the balance and history it already had", async () => {
    const text = await render(StudentPaymentSummary, [
      [PROFILE, new RefreshFailed(profile)],
      [PAYMENTS, new RefreshFailed({ payments: [], transactions: [] })],
    ]);
    expect(text).toContain("Hali tranzaksiya yo'q");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });
});
