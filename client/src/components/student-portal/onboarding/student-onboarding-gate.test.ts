import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { OnboardingStatus } from "../lib/types";
import { ONBOARDING_QUERY_KEY } from "../lib/queries";
import { StudentOnboardingGate } from "./student-onboarding-gate";

const PORTAL = "PORTAL-CONTENT";
const PHONE = "901234567";

/** Renders the gate over a cache whose onboarding query has settled. */
async function render(
  outcome: OnboardingStatus | Error | "pending",
  { offline = false }: { offline?: boolean } = {},
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  if (outcome !== "pending") {
    await client.prefetchQuery({
      queryKey: ONBOARDING_QUERY_KEY,
      queryFn: () =>
        outcome instanceof Error ? Promise.reject(outcome) : outcome,
    });
  }
  onlineManager.setOnline(!offline);
  let html: string;
  try {
    html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(StudentOnboardingGate, null, PORTAL),
      ),
    );
  } finally {
    onlineManager.setOnline(true);
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

const status = (missing: OnboardingStatus["missing"]): OnboardingStatus => ({
  missing,
  phone: PHONE,
  phoneVerified: !missing.includes("PHONE"),
});

// ADR-0039: the portal opens only after the phone is proved by SMS and gender
// and birth date are given.
describe("the student portal's first-run gate", () => {
  it("opens the portal once nothing is missing", async () => {
    const text = await render(status([]));
    expect(text).toContain(PORTAL);
    expect(text).not.toContain("Profilingizni to'ldiring");
  });

  it("stands in for the whole portal while the phone is unproved", async () => {
    const text = await render(status(["PHONE", "GENDER", "BIRTH_DATE"]));
    expect(text).not.toContain(PORTAL);
    expect(text).toContain("Profilingizni to'ldiring");
    expect(text).toContain("1-qadam / 2");
    expect(text).toContain("Telefon raqamingizni tasdiqlang");
    // The code goes to the number on the card, shown so the student knows.
    expect(text).toContain("+998 90 123 45 67");
    expect(text).toContain("Kod yuborish");
    // A student who cannot finish can still leave.
    expect(text).toContain("Chiqish");
  });

  it("asks only for what the card lacks", async () => {
    const text = await render(status(["BIRTH_DATE"]));
    expect(text).not.toContain(PORTAL);
    expect(text).toContain("Tug'ilgan sanangiz");
    expect(text).not.toContain("Jinsingiz");
    expect(text).not.toContain("Telefon raqamingizni tasdiqlang");
    expect(text).toContain("Bir qadam qoldi");
  });

  it("asks for gender and birth date together", async () => {
    const text = await render(status(["GENDER", "BIRTH_DATE"]));
    expect(text).toContain("Jinsingiz");
    expect(text).toContain("Erkak");
    expect(text).toContain("Ayol");
    expect(text).toContain("Tug'ilgan sanangiz");
  });

  it("shows neither the portal nor the form while the answer is pending", async () => {
    const text = await render("pending");
    expect(text).not.toContain(PORTAL);
    expect(text).not.toContain("Profilingizni to'ldiring");
  });

  // A data requirement, not a security boundary: one failed request must not
  // take the whole app away.
  it("fails open when the request failed", async () => {
    expect(await render(new Error("Network Error"))).toContain(PORTAL);
  });

  it("fails open offline", async () => {
    expect(await render("pending", { offline: true })).toContain(PORTAL);
  });
});
