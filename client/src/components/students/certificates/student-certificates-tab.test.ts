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
      thresholds: { attendance: 80, app: 100 },
      verdict: { attendanceOk: true, appOk: true, eligible: true, reasons: [] },
      issued: [],
    },
  ],
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

/** The tab rendered over a cache whose last fetch FAILED, with or without an answer from before. */
function renderFailed(withData: boolean) {
  // retryOnMount off: otherwise the static render starts the fetch and reads as «loading».
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  client.getQueryCache().build(client, { queryKey: certificatePreviewKey(STUDENT_ID) }).setState({
    data: withData ? PREVIEW : undefined,
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
