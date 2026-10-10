import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CloseButton,
  DaftarSkin,
  Loading,
  Notice,
  NotRegisteredNotice,
  StaffAccountNotice,
} from "./mini-app-notices";

// Each cabinet points to the bot step that links ITS kind of account: a
// student's Telegram is linked by /start «📱 Hisobimni bog'lash», a staff
// member's by /xodim (ADR-0045). Sending a teacher to «To'lovlar» would link
// nothing.
describe("Mini App notices", () => {
  it("tells an unlinked student to share their number through «Hisobimni bog'lash»", () => {
    const html = renderToStaticMarkup(
      createElement(NotRegisteredNotice, { audience: "student" }),
    );

    expect(html).toContain("Hisobimni bog&#x27;lash");
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

  // The server has just sent the chat a fresh «💼 Kabinet» button, and every
  // linked staff chat's menu button already opens the staff cabinet — /start
  // is no longer needed.
  it("sends staff who opened the student cabinet to the button in the chat", () => {
    const html = renderToStaticMarkup(createElement(StaffAccountNotice));

    expect(html).toContain("xodim sifatida");
    expect(html).toContain("💼 Kabinet");
    expect(html).not.toContain("/start");
  });
});

// The staff cabinet is drawn on the Daftar sheet of the staff sign-in pages,
// the student cabinet in Lumio. Lumio's classes paint nothing outside `.lumio`
// (a coral button there is white text on no background), so on the sheet not
// one of them may be left — and off the sheet nothing may change.
describe("Mini App notices on the Daftar sheet", () => {
  const LUMIO_LOOK =
    /clay-|font-display|coral|\bink-\d|bg-sunk|bg-surface|rounded-card/;
  const error = createElement(
    Notice,
    // `children` is the third argument (react/no-children-prop).
    {
      alert: true,
      icon: null,
      title: "Kirib bo'lmadi",
      description: "Internetni tekshiring.",
    } as ComponentProps<typeof Notice>,
    createElement(CloseButton),
  );
  const everyLeaf = [
    createElement(Loading, null, "Kabinet ochilmoqda…"),
    createElement(NotRegisteredNotice, { audience: "staff" }),
    error,
  ];
  const draw = (node: ReactNode, daftar: boolean) =>
    renderToStaticMarkup(createElement(DaftarSkin, { value: daftar }, node));
  const words = (html: string) => html.replace(/<[^>]+>/g, "|");

  it("keeps Lumio out of the sheet and says the same words", () => {
    for (const leaf of everyLeaf) {
      const onSheet = draw(leaf, true);

      expect(onSheet).not.toMatch(LUMIO_LOOK);
      expect(words(onSheet).replace(/\|+/g, "|")).toBe(
        words(draw(leaf, false)).replace(/\|+/g, "|"),
      );
    }
  });

  it("stays Lumio wherever the page did not ask for the sheet", () => {
    for (const leaf of everyLeaf) {
      expect(renderToStaticMarkup(leaf)).toBe(draw(leaf, false));
      expect(renderToStaticMarkup(leaf)).toMatch(LUMIO_LOOK);
    }
  });

  it("writes a failure in red pen and announces it", () => {
    const onSheet = draw(error, true);

    expect(onSheet).toContain('role="alert"');
    expect(onSheet).toContain("daftar-hand");
    expect(onSheet).toContain("text-destructive");
    // A notice that is not a failure is not announced as one.
    expect(
      draw(createElement(NotRegisteredNotice, { audience: "staff" }), true),
    ).not.toContain('role="alert"');
  });
});
