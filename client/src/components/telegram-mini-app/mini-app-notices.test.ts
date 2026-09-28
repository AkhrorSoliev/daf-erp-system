import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotRegisteredNotice, StaffAccountNotice } from "./mini-app-notices";

// Each cabinet points to the bot step that links ITS kind of account: a
// student's Telegram is linked by «💳 To'lovlar», a staff member's by /xodim
// (ADR-0045). Sending a teacher to «To'lovlar» would link nothing.
describe("Mini App notices", () => {
  it("tells an unlinked student to share their number through «To'lovlar»", () => {
    const html = renderToStaticMarkup(
      createElement(NotRegisteredNotice, { audience: "student" }),
    );

    expect(html).toContain("To&#x27;lovlar");
    expect(html).not.toContain("/xodim");
  });

  it("tells an unlinked staff member to link through /xodim", () => {
    const html = renderToStaticMarkup(
      createElement(NotRegisteredNotice, { audience: "staff" }),
    );

    expect(html).toContain("/xodim");
    expect(html).toContain("xodim hisobiga bog&#x27;lanmagan");
    expect(html).not.toContain("To&#x27;lovlar");
  });

  it("sends staff who opened the student cabinet back to the bot's /start", () => {
    const html = renderToStaticMarkup(createElement(StaffAccountNotice));

    expect(html).toContain("xodim sifatida");
    expect(html).toContain("/start");
  });
});
