import { describe, expect, it } from "vitest";
import { filterPages, type SearchablePage } from "./searchable-pages";

const pages: SearchablePage[] = [
  { label: "O'quvchilar", url: "/students", keywords: ["student", "oquvchi"] },
  { label: "Moliya", url: "/payments", keywords: ["tolov"] },
];
const ru = (s: string) => ({ "O'quvchilar": "Ученики", Moliya: "Финансы" })[s] ?? s;
const urls = (q: string, t?: (s: string) => string) => filterPages(q, pages, t).map((p) => p.url);

describe("filterPages", () => {
  it("matches the Uzbek title and keywords without a translator", () => {
    expect(urls("o'quv")).toEqual(["/students"]);
    expect(urls("tolov")).toEqual(["/payments"]);
  });

  it("matches the translated title, and still the Uzbek title and keywords", () => {
    expect(urls("учен", ru)).toEqual(["/students"]);
    expect(urls("moliya", ru)).toEqual(["/payments"]);
    expect(urls("student", ru)).toEqual(["/students"]);
  });
});
