import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/context";
import de from "@/i18n/dictionaries/de";
import ru from "@/i18n/dictionaries/ru";
import { TranslatedStatusBadge } from "@/components/shared/translated-status-badge";
import { ActivityError, PeriodToggle } from "./activity-ui";
import { KursBolimi, MashqBolimi, SeanslarBolimi, SozlarBolimi, VaqtBolimi } from "./student-activity-sections";
import type { OquvchiFaolligi } from "./types";

const data: OquvchiFaolligi = {
  davr: 7,
  bugun: "2026-10-18",
  kuzatuvBoshi: "2026-09-01",
  studentId: 10001,
  ism: "Ali Valiyev",
  photo: null,
  akkaunt: true,
  hisobBoshi: "2026-09-01",
  maxraj: 7,
  oxirgiFaollik: { vaqt: "2026-10-18T05:00:00Z", platforma: "ANDROID" },
  fortschritt: { gesamt: 40, stufe: { de: "Anfänger", uz: "Boshlang'ich" }, serie: 3 },
  vaqt: {
    faolSoniya: 4830,
    radioSoniya: 600,
    kirdi: true,
    platforma: { WEB: 1200, ANDROID: 3630, IOS: 0 },
    bolim: { LERNEN: 4000, OTHER: 830 },
  },
  shugullanganKunlar: 3,
  xarita: [],
  mashq: {
    savollar: 20,
    togri: 15,
    xatolar: 5,
    foiz: 75,
    konikmalar: [
      { konikma: "LESEN", savollar: 10, togri: 8, foiz: 80 },
      { konikma: "HOEREN", savollar: 0, togri: 0, foiz: null },
    ],
  },
  darajalar: [
    { daraja: "A1", tugatilgan: 5, jami: 10, holat: "DAVOM", tugatilganSana: null },
    { daraja: "A2", tugatilgan: 0, jami: 8, holat: "BOSHLANMAGAN", tugatilganSana: null },
  ],
  joriyDaraja: { daraja: "A1", tugatilgan: 5, jami: 10, holat: "DAVOM", guruhdanOrqada: false },
  bolimlar: [],
  sozlar: { mustahkam: 4, organilmoqda: 3, yangi: 2, bugunTakror: 6 },
  qiyinSozlar: [{ lexemeId: 1, de: "Haus", uz: "uy", xatolar: 4 }],
  seanslar: [
    {
      id: "s1",
      tur: "LESSON",
      darsNomi: "Lektion 1",
      boshlandi: "2026-10-17T05:00:00Z",
      tugadi: "2026-10-17T05:20:00Z",
      savollar: 10,
      togri: 8,
    },
    {
      id: "s2",
      tur: "REVIEW",
      darsNomi: null,
      boshlandi: "2026-10-16T05:00:00Z",
      tugadi: "2026-10-16T05:05:00Z",
      savollar: 5,
      togri: 5,
    },
  ],
};

// `children` is the third argument (react/no-children-prop).
const inRu = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(I18nProvider, { initialLocale: "ru", initialDictionary: ru } as ComponentProps<typeof I18nProvider>, el),
  );
const inDe = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(I18nProvider, { initialLocale: "de", initialDictionary: de } as ComponentProps<typeof I18nProvider>, el),
  );
const inUz = (el: ReactElement) => renderToStaticMarkup(el);

describe("the student's app-activity sections follow the page language", () => {
  it("time section: titles, durations and platform names in Russian", () => {
    const html = inRu(createElement(VaqtBolimi, { data }));
    expect(html).toContain("Время в приложении");
    expect(html).toContain("1 ч 20 мин");
    expect(html).toContain("Дней с занятиями: 3 из 7");
    expect(html).toContain("По платформам");
    expect(html).toContain("Веб");
    expect(html).not.toContain("daq");
    expect(html).not.toContain("Platforma");
  });

  it("exercise section: skill names in Russian, the German name kept beside them", () => {
    const html = inRu(createElement(MashqBolimi, { data }));
    expect(html).toContain("Упражнения");
    expect(html).toContain("Чтение");
    expect(html).toContain("Lesen");
    expect(html).toContain("Упражнений ещё не было");
  });

  it("exercise section in German does not repeat a skill name that is already German", () => {
    const html = inDe(createElement(MashqBolimi, { data }));
    expect(html.match(/Lesen/g)).toHaveLength(1);
    expect(html.match(/Hören/g)).toHaveLength(1);
  });

  it("course section: level state and lesson counts in Russian", () => {
    const html = inRu(createElement(KursBolimi, { data }));
    expect(html).toContain("Прогресс по курсу");
    expect(html).toContain("Идёт");
    expect(html).toContain("Ещё не начат");
    expect(html).toContain("Уроков: 5/10");
  });

  it("words and sessions: counts, session kinds and an untitled review in Russian", () => {
    const words = inRu(createElement(SozlarBolimi, { data }));
    expect(words).toContain("Повторить сегодня слов: 6");
    expect(words).toContain("ошибок: 4");
    expect(words).toContain("Haus");
    const sessions = inRu(createElement(SeanslarBolimi, { data }));
    expect(sessions).toContain("История сеансов");
    expect(sessions).toContain("Занятие");
    expect(sessions).toContain("Lektion 1");
    expect(sessions.match(/Повторение/g)).toHaveLength(2);
    expect(sessions).toContain("20 мин");
  });

  it("without a provider the sections say Uzbek, as before", () => {
    const html = inUz(createElement(VaqtBolimi, { data }));
    expect(html).toContain("Ilovada vaqt");
    expect(html).toContain("1 soat 20 daq");
    expect(html).toContain("3 / 7 kun shug&#x27;ullangan");
  });

  it("period toggle and error block follow the language", () => {
    const toggle = inRu(createElement(PeriodToggle, { value: 7, onChange: () => {} }));
    expect(toggle).toContain("7 дней");
    expect(toggle).toContain('aria-label="Период"');
    const failed = inRu(createElement(ActivityError, { onRetry: () => {} }));
    expect(failed).toContain("Повторить");
  });
});

describe("TranslatedStatusBadge", () => {
  it("draws student, teacher and group statuses in Russian and leaves an unknown code as it came", () => {
    expect(inRu(createElement(TranslatedStatusBadge, { entityType: "students", status: "FROZEN" }))).toContain("Замороженный");
    expect(inRu(createElement(TranslatedStatusBadge, { entityType: "teachers", status: "TERMINATED" }))).toContain("Уволен");
    expect(inRu(createElement(TranslatedStatusBadge, { entityType: "groups", status: "PAUSED" }))).toContain("Пауза");
    expect(inRu(createElement(TranslatedStatusBadge, { entityType: "groups", status: "WEIRD_CODE" }))).toContain("WEIRD_CODE");
  });

  it("keeps other entities' Uzbek labels", () => {
    expect(inRu(createElement(TranslatedStatusBadge, { entityType: "branches", status: "CLOSED" }))).toContain("Yopilgan");
  });
});
