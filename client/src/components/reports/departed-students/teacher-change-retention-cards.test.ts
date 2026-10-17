import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it } from "vitest";
import { TeacherChangeRetentionCards } from "./teacher-change-retention-cards";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const PARAMS = { startDate: "2026-09-01", endDate: "2026-09-30", courseId: "c1", teacherIds: "5,6" };
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(TooltipProvider, null, createElement(TeacherChangeRetentionCards, { queryParams: PARAMS, isLoading: false, ...props } as never))),
  );

describe("TeacherChangeRetentionCards", () => {
  it("the maket sentence with the period, the groups and the students", () => {
    const text = norm(render({ data: { totalTeacherChanges: 6, departedAfterTeacherChange: 4 }, periodLabel: "sentabrda" }));
    expect(text).toContain("Sentabrda 6 ta guruhda ustoz almashdi. Keyingi 5 darsda shu guruhlardan 4 o'quvchi ketdi.");
  });
  it("no period given: «Shu davrda»; no changes: says so and the links are off", () => {
    const html = render({ data: { totalTeacherChanges: 0, departedAfterTeacherChange: 0 } });
    expect(norm(html)).toContain("Shu davrda ustoz almashgan guruh yo'q.");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it("loading draws a skeleton", () => {
    expect(render({ data: undefined, isLoading: true })).toContain('data-slot="skeleton"');
  });
});
