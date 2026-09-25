import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardPeople } from "./dashboard-summary-types";
import { HomePeopleStats } from "./home-people-stats";

const people: DashboardPeople = {
  activeStudents: 842,
  newThisMonth: 12,
  leftThisMonth: 5,
  leftPending: 3,
  leftGraceDays: { LEFT_GROUP: 21, FROZEN: 60 },
  activeGroups: 47,
  attendancePct: 88,
  todayLessons: 4,
};

/** The hover text of the «Aktiv o'quvchilar» +new / −left hint. */
function hintTitle(p: DashboardPeople): string {
  const html = renderToStaticMarkup(
    createElement(HomePeopleStats, { people: p }),
  );
  const title = [...html.matchAll(/title="([^"]*)"/g)]
    .map((m) => m[1].replaceAll("&#x27;", "'").replaceAll("&amp;", "&"))
    .find((t) => t.startsWith("Shu oy:"));
  if (title === undefined) throw new Error("no hint title in the markup");
  return title;
}

describe("HomePeopleStats hint", () => {
  it("names the grace period of each kind of stop while some are pending", () => {
    expect(hintTitle(people)).toBe(
      "Shu oy: +12 yangi, −5 ketgan. Yana 3 nafari qaytmasa qo'shiladi " +
        "(guruhdan chiqqan 21 kun, muzlatilgan 60 kun kutiladi).",
    );
  });

  it("reads both periods from the API", () => {
    expect(
      hintTitle({ ...people, leftGraceDays: { LEFT_GROUP: 7, FROZEN: 30 } }),
    ).toContain("(guruhdan chiqqan 7 kun, muzlatilgan 30 kun kutiladi).");
  });

  it("leaves the pending sentence out when nobody is pending", () => {
    expect(hintTitle({ ...people, leftPending: 0 })).toBe(
      "Shu oy: +12 yangi, −5 ketgan.",
    );
  });
});
