import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PhoneProofBadge, TelegramBotBadge } from "./student-contact-badges";

function text(el: ReactElement): string {
  return renderToStaticMarkup(createElement(TooltipProvider, null, el))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ADR-0039: the staff card tells the two apart — a phone proved by SMS, and a
// Telegram chat linked to the bot. Neither implies the other.
describe("student card contact badges", () => {
  it("shows a proved phone as proved", () => {
    expect(
      text(
        createElement(PhoneProofBadge, {
          verified: true,
          verifiedAt: "2026-09-27T06:30:00.000Z",
        }),
      ),
    ).toBe("Telefon tasdiqlangan");
  });

  it("says so when the phone is not proved", () => {
    expect(
      text(
        createElement(PhoneProofBadge, { verified: false, verifiedAt: null }),
      ),
    ).toBe("Telefon tasdiqlanmagan");
  });

  it("marks a card whose Telegram chat is linked to the bot", () => {
    expect(text(createElement(TelegramBotBadge, { chatId: "123456789" }))).toBe(
      "Telegram botda ro'yxatdan o'tgan",
    );
  });

  it("draws nothing for a card with no linked chat", () => {
    expect(text(createElement(TelegramBotBadge, { chatId: null }))).toBe("");
  });
});
