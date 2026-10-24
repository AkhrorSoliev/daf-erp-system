import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get, post: vi.fn() } }));

import { certificatePreviewKey, certificatePreviewOptions } from "./certificate-queries";
import { StudentCertificatesTab } from "./student-certificates-tab";
import type { CertificatePreview } from "./certificate-types";

// Made-up student and figures.
const STUDENT_ID = 10001;
const PREVIEW: CertificatePreview = {
  studentId: STUDENT_ID,
  balance: 0,
  unleveledGroups: [],
  levels: [
    {
      level: "A1",
      groupNames: ["A1-17"],
      courseName: "Deutsch A1",
      lessonMinutes: 90,
      from: "2026-07-07",
      to: "2026-10-15",
      attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
      app: { applies: true, done: 80, open: 80, percent: 100 },
      unitTests: { passed: 5, total: 5 },
      mock: null,
      thresholds: { attendance: 80, app: 100, minLessons: 20, maxLatePercent: 20 },
      verdict: {
        attendanceOk: true,
        appOk: true,
        debtOk: true,
        lessonsOk: true,
        lateOk: true,
        latePercent: 10,
        testsOk: true,
        eligible: true,
        reasons: [],
      },
      issued: [],
    },
  ],
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

/** The tab rendered over a cache whose last fetch FAILED, with or without an answer from before. */
function renderFailed(withData: boolean, preview: CertificatePreview = PREVIEW) {
  // retryOnMount off: otherwise the static render starts the fetch and reads as «loading».
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  client.getQueryCache().build(client, { queryKey: certificatePreviewKey(STUDENT_ID) }).setState({
    data: withData ? preview : undefined,
    dataUpdatedAt: withData ? Date.now() : 0,
    status: "error",
    error: new Error("boom"),
    errorUpdatedAt: Date.now(),
    fetchStatus: "idle",
  });
  return norm(
    renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(StudentCertificatesTab, { studentId: STUDENT_ID })),
    ),
  );
}

describe("StudentCertificatesTab after a failed fetch", () => {
  it("keeps the list already on screen when only a background refetch failed", () => {
    const text = renderFailed(true);
    expect(text).toContain("A1 daraja");
    expect(text).toContain("Shart bajarilgan");
    expect(text).not.toContain("yuklab bo'lmadi");
  });

  it("shows the server's new reasons and the debt, lessons and lateness lines of a blocked level", () => {
    const level = PREVIEW.levels[0];
    const blocked: CertificatePreview = {
      ...PREVIEW,
      balance: -250000,
      levels: [
        {
          ...level,
          attendance: { attended: 14, late: 5, absent: 0, counted: 14, percent: 100 },
          verdict: {
            ...level.verdict,
            debtOk: false,
            lessonsOk: false,
            lateOk: false,
            latePercent: 36,
            eligible: false,
            reasons: [
              "Darslar soni 14 ta, kamida 20 ta kerak",
              "Kech qolish 36%, ruxsat etilgani 20%",
              "Qarzi bor: 250 000 so'm",
            ],
          },
        },
      ],
    };
    const text = renderFailed(true, blocked);
    expect(text).toContain("Shart bajarilmagan");
    expect(text).toContain("Darslar soni 14 ta, kamida 20 ta kerak · Kech qolish 36%, ruxsat etilgani 20% · Qarzi bor: 250 000 so'm");
    expect(text).toContain("Kech qolgan");
    expect(text).toContain("5 / 14 dars (36%)");
    expect(text).toContain("chegara 20%");
    expect(text).toContain("kamida 20 ta");
    // The summary line (label, then value), not the reason sentence.
    expect(text).toContain("Qarz 250 000 so'm");
  });

  it("with nothing loaded yet, shows the error and the retry button", () => {
    const text = renderFailed(false);
    expect(text).toContain("Hujjat ma'lumotini yuklab bo'lmadi.");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("A1 daraja");
  });
});

describe("the preview query's retry", () => {
  /** Runs the query to its final failure and says how many requests it made. */
  async function requestsUntilGivenUp(error: unknown) {
    get.mockReset();
    get.mockRejectedValue(error);
    // retry 3 = the browser's default; in Node the library's default is 0, which would hide a missing option.
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    const observer = new QueryObserver(client, certificatePreviewOptions(STUDENT_ID, true));
    await new Promise<void>((resolve) => {
      const stop = observer.subscribe((r) => {
        if (r.isError) {
          stop();
          resolve();
        }
      });
    });
    return get.mock.calls.length;
  }

  it("does not retry a 404 (an archived student): one request, then the error", async () => {
    expect(await requestsUntilGivenUp({ response: { status: 404 } })).toBe(1);
  });

  it("does not retry a 403", async () => {
    expect(await requestsUntilGivenUp({ response: { status: 403 } })).toBe(1);
  });

  it("still retries a server failure, at most twice", async () => {
    expect(await requestsUntilGivenUp({ response: { status: 503 } })).toBe(3);
  });

  it("still retries a network failure", async () => {
    expect(await requestsUntilGivenUp(new Error("Network Error"))).toBe(3);
  });
});
