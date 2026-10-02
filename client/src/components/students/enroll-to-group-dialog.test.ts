import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  type QueryObserverOptions,
} from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get } }));

import { formatBalance, formatPrice } from "@/lib/format-utils";
import {
  EnrollPreviewBlock,
  type EnrollPreview,
} from "./enroll-to-group-dialog";

// The dialog's group list and its selection are state that a static render
// never reaches (no effects, no clicks), so the block that answers "what will
// this cost" is rendered on its own, the way the dialog draws it once a group
// is selected. Every figure it prints comes from the server's preview.

// Same formatters the block uses, so the assertions hold whatever ICU the
// machine running the tests carries; `norm` turns their U+00A0 into a plain
// space, like the page text they are compared with.
const money = (n: number) => norm(`${formatPrice(n)} so'm`);
const balance = (n: number) => norm(formatBalance(n));

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// 405 000 a month, 8 of the month's 13 lessons still to come, nothing taken
// off: 405 000 × 8 / 13 is the 249 231 the server quotes.
const monthly = (over: Partial<EnrollPreview> = {}): EnrollPreview => ({
  paymentModel: "MONTHLY",
  coursePrice: 405000,
  lessonPaymentCount: null,
  discountPercent: 0,
  firstMonth: {
    period: "2026-10",
    plannedLessons: 13,
    coveredLessons: 8,
    amount: 249231,
  },
  balance: 50000,
  payable: 199231,
  ...over,
});

const pack = (over: Partial<EnrollPreview> = {}): EnrollPreview => ({
  paymentModel: "LESSON_PACK",
  coursePrice: 400000,
  lessonPaymentCount: 12,
  discountPercent: 0,
  firstMonth: null,
  balance: 100000,
  payable: 300000,
  ...over,
});

type Props = Partial<Parameters<typeof EnrollPreviewBlock>[0]>;

function markup(client: QueryClient, props: Props = {}): string {
  return norm(
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(EnrollPreviewBlock, {
          studentId: 10042,
          groupId: "g-1",
          startDate: undefined,
          onStartDateChange: () => {},
          ...props,
        }),
      ),
    ),
  );
}

// `retryOnMount: false` keeps a failed query failed on this second render
// rather than showing it as a fresh load, as the portal's load-state tests do.
const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });

/**
 * The block once the server has answered. The first render registers the
 * query; it is then answered through the mocked API, exactly as the real
 * request would be; the second render reads the answer.
 */
async function answered(
  outcome: EnrollPreview | Error,
  props: Props = {},
  client = newClient(),
): Promise<string> {
  get.mockImplementationOnce(() =>
    outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve({ data: outcome }),
  );
  markup(client, props);
  await Promise.allSettled(
    client.getQueryCache().getAll().map((query) => query.fetch()),
  );
  return markup(client, props);
}

beforeEach(() => get.mockReset());

describe("EnrollPreviewBlock — a monthly course", () => {
  it("shows the monthly price, the first month's bill and what is left to pay, as the server sent them", async () => {
    const text = await answered(monthly());

    expect(text).toContain(`Oylik narx: ${money(405000)}`);
    expect(text).toContain(`Oktabr uchun (8/13 dars): ${money(249231)}`);
    expect(text).toContain(`O'quvchi balansi: ${balance(50000)}`);
    expect(text).toContain(`To'lash kerak (taxminan): ${money(199231)}`);
    expect(text).not.toContain("Kurs narxi");
    expect(text).not.toContain("chegirma");
  });

  it("names the discount at the end of the first month's label when the student has one", async () => {
    // 450 000 less 10%, over the same 8 of 13 lessons: 249 231 again.
    const text = await answered(
      monthly({ coursePrice: 450000, discountPercent: 10 }),
    );

    expect(text).toContain(
      `Oktabr uchun (8/13 dars): · chegirma 10% ${money(249231)}`,
    );
  });

  it("says the bill is written when the group's lessons start, in place of a first-month line", async () => {
    // A group that is not active yet has no first month; the server's
    // `payable` is then just the debt, if any.
    const text = await answered(
      monthly({ firstMonth: null, balance: -30000, payable: 30000 }),
    );

    expect(text).toContain("Hisob guruh darslari boshlanganda yoziladi");
    expect(text).not.toContain("uchun (");
    expect(text).toContain(`Oylik narx: ${money(405000)}`);
    expect(text).toContain(`O'quvchi balansi: ${balance(-30000)}`);
    expect(text).toContain(`To'lash kerak (taxminan): ${money(30000)}`);
  });
});

describe("EnrollPreviewBlock — a lesson-pack course", () => {
  it("shows the pack price with its lesson count, and no monthly lines", async () => {
    const text = await answered(pack());

    expect(text).toContain(`Kurs narxi (12 dars): ${money(400000)}`);
    expect(text).toContain(`O'quvchi balansi: ${balance(100000)}`);
    expect(text).toContain(`To'lash kerak (taxminan): ${money(300000)}`);
    expect(text).not.toContain("Oylik narx");
    // A pack never has a first month: its null is not «no lessons yet».
    expect(text).not.toContain("Hisob guruh darslari boshlanganda yoziladi");
  });
});

describe("EnrollPreviewBlock — what is left to pay", () => {
  it("says «Yetarli» when the server owes the student nothing to pay", async () => {
    const text = await answered(monthly({ balance: 400000, payable: 0 }));

    expect(text).toContain("To'lash kerak (taxminan): Yetarli");
  });

  it("prints the server's `payable`, not price minus balance", async () => {
    // 249 231 − 50 000 = 199 231, 405 000 − 50 000 = 355 000: the server's
    // figure matches neither (a transfer's release, say), and the client
    // adds nothing of its own.
    const text = await answered(monthly({ payable: 123456 }));

    expect(text).toContain(`To'lash kerak (taxminan): ${money(123456)}`);
    expect(text).not.toContain(money(199231));
    expect(text).not.toContain(money(355000));
  });
});

describe("EnrollPreviewBlock — while it loads and when it fails", () => {
  it("shows one «Hisoblanmoqda…» line and no money, with the date picker in place", () => {
    const text = markup(newClient());

    expect(text).toContain("Hisoblanmoqda…");
    expect(text).toContain("Bugundan boshlab");
    expect(text).not.toContain("so'm");
  });

  it("shows no money lines when the request fails (a server older than the endpoint), and the date picker stays", async () => {
    const text = await answered(new Error("Request failed with status code 404"));

    expect(text).toContain("Boshlanish sanasi (qaysi darsdan)");
    expect(text).toContain("Bugundan boshlab");
    expect(text).not.toContain("Hisoblanmoqda");
    expect(text).not.toContain("so'm");
    expect(text).not.toContain("Yetarli");
  });

  it("shows no money lines when a later request fails, though an earlier answer for the same group and day is cached", async () => {
    // A failed refetch keeps the last good answer in the query; the figures
    // may be minutes old by then, and an error means no money lines.
    const client = newClient();
    await answered(monthly(), {}, client);

    const text = await answered(new Error("Network Error"), {}, client);

    expect(text).toContain("Bugundan boshlab");
    expect(text).not.toContain("so'm");
    expect(text).not.toContain("Yetarli");
  });
});

describe("EnrollPreviewBlock — the request", () => {
  it("asks for the selected group and the picked day as YYYY-MM-DD", async () => {
    await answered(monthly(), { startDate: new Date(2026, 9, 5) });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/students/10042/enroll-preview", {
      params: { groupId: "g-1", startDate: "2026-10-05" },
    });
  });

  it("leaves the day out when none is picked", async () => {
    await answered(monthly());

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1].params).toStrictEqual({ groupId: "g-1" });
  });

  it("asks afresh each time and does not retry a failed request, whatever the app's defaults say", () => {
    // The app reuses an answer for five minutes (a balance that has moved
    // since would be wrong money) and, in a browser, retries a failure for
    // seven seconds (an old server's 404 would keep «Hisoblanmoqda…» up).
    // Neither shows in the markup, so the options the query registered with
    // are read instead.
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 3 } },
    });
    markup(client);

    const options = client.getQueryCache().getAll()[0]
      .options as QueryObserverOptions;
    expect(options.staleTime).toBe(0);
    expect(options.retry).toBe(false);
  });

  it("does not show one group's or day's figures while another's are loading", async () => {
    const client = newClient();
    await answered(monthly(), {}, client);

    expect(markup(client)).toContain(`To'lash kerak (taxminan): ${money(199231)}`);
    for (const other of [
      { groupId: "g-2" },
      { startDate: new Date(2026, 9, 20) },
    ]) {
      const text = markup(client, other);
      expect(text).toContain("Hisoblanmoqda…");
      expect(text).not.toContain(money(199231));
    }
  });
});
