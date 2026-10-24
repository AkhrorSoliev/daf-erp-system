import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/context";
import ru from "@/i18n/dictionaries/ru";
import { DepartureMoneyBlock } from "./departure-money-block";
import type { DeparturePolicy, DeparturePreview } from "./departure-money";

const preview = (over: Partial<DeparturePreview> = {}): DeparturePreview => ({
  departureDay: "2026-10-14",
  balance: 0,
  mayChoosePolicy: true,
  defaultPolicy: "STUDENT_CANCELLED",
  enrollments: [
    {
      enrollmentId: "enr-1",
      groupId: "g-1",
      groupName: "A1-12",
      status: "ACTIVE",
      month: {
        period: "2026-10",
        departureDay: "2026-10-14",
        lessonDates: ["2026-10-02", "2026-10-14", "2026-10-16"],
        held: 2,
        covered: 3,
        heldPercent: 67,
        threshold: 40,
        contractApplies: true,
        chargedAmount: 240000,
        outcomes: {
          STUDENT_CANCELLED: { lessons: 0, amount: 0, withheld: true },
          LEVEL_COMPLETED: { lessons: 1, amount: 80000, withheld: false },
          CENTER_INITIATIVE: { lessons: 1, amount: 80000, withheld: false },
          QUALITY_CLAIM: { lessons: 3, amount: 240000, withheld: false },
        },
      },
    },
  ],
  ...over,
});

const render = (
  props: Partial<Parameters<typeof DepartureMoneyBlock>[0]> = {},
) =>
  renderToStaticMarkup(
    createElement(DepartureMoneyBlock, {
      preview: preview(),
      isLoading: false,
      isError: false,
      policy: "STUDENT_CANCELLED" as DeparturePolicy,
      onPolicyChange: () => {},
      context: "removal",
      ...props,
    }),
  );

describe("DepartureMoneyBlock", () => {
  it("offers a CEO or branch director four ways out of a group", () => {
    const html = render();
    expect(html).toContain("Pul (shartnoma bo&#x27;yicha)");
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).toContain("Darajani tugatdi");
    expect(html).toContain("Markaz tashabbusi");
    expect(html).toContain("Sifat bo&#x27;yicha shikoyat");
    expect(html).toContain("Pul qaytmaydi");
  });

  it("offers them three for an expulsion — a completed level is not one", () => {
    const html = render({ context: "expel" });
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).not.toContain("Darajani tugatdi");
  });

  it("offers an administrator a completed level beside the default on a removal", () => {
    const html = render({ preview: preview({ mayChoosePolicy: false }) });
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Darajani tugatdi");
    expect(html).not.toContain("Markaz tashabbusi</span>");
    expect(html).toContain("faqat direktor yoki CEO tanlaydi");
  });

  it("locks an administrator's expulsion to the student's own decision", () => {
    const html = render({
      preview: preview({ mayChoosePolicy: false }),
      policy: "QUALITY_CLAIM",
      context: "expel",
    });
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("faqat direktor yoki CEO tanlaydi");
    // The consequence follows the locked default, not a stale choice.
    expect(html).toContain("Pul qaytmaydi");
  });

  it("follows the chosen policy", () => {
    expect(render({ policy: "QUALITY_CLAIM" })).toContain(
      "Oyning to&#x27;liq puli qaytadi",
    );
  });

  it("draws nothing for a student with no monthly charge", () => {
    const html = render({
      preview: preview({
        enrollments: [
          {
            enrollmentId: "enr-2",
            groupId: "g-2",
            groupName: "B1-3",
            status: "ACTIVE",
            month: null,
          },
        ],
      }),
    });
    expect(html).toBe("");
  });

  it("keeps the figures it already has when a refetch fails", () => {
    expect(render({ isError: true })).toContain("Pul qaytmaydi");
  });

  it("says the figures could not be loaded instead of guessing", () => {
    expect(render({ preview: undefined, isError: true })).toContain(
      "Pul hisobini yuklab bo&#x27;lmadi",
    );
  });
});

describe("DepartureMoneyBlock in Russian", () => {
  const inRussian = (
    props: Partial<Parameters<typeof DepartureMoneyBlock>[0]> = {},
  ) =>
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        // `children` is the third argument (react/no-children-prop).
        { initialLocale: "ru", initialDictionary: ru } as ComponentProps<typeof I18nProvider>,
        createElement(DepartureMoneyBlock, {
          preview: preview(),
          isLoading: false,
          isError: false,
          policy: "STUDENT_CANCELLED" as DeparturePolicy,
          onPolicyChange: () => {},
          context: "removal",
          ...props,
        }),
      ),
    )
      .replace(/&#x27;/g, "'")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");

  it("translates the title, the options, the month facts and the consequence", () => {
    const text = inRussian();
    expect(text).toContain("Деньги (по договору)");
    expect(text).toContain("Закончил уровень");
    expect(text).toContain("Жалоба на качество");
    expect(text).toContain("Октябрь: занятий — 3, 240");
    expect(text).toContain("Договор, п. 6.2");
    expect(text).toContain("Деньги не возвращаются");
    // The data stays as it came.
    expect(text).not.toContain("Pul");
  });

  it("translates the locked note and the failure line", () => {
    expect(inRussian({ preview: preview({ mayChoosePolicy: false }) })).toContain(
      "выбирает только директор или CEO",
    );
    expect(inRussian({ preview: undefined, isError: true })).toContain(
      "Не удалось загрузить расчёт денег",
    );
  });
});
