import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RadioStatus } from "../lib/radio-store";
import { RadioSessionButton, RadioSessionToggle } from "./radio-session-toggle";

const noop = () => {};

function ariaLabels(html: string): string[] {
  return [...html.matchAll(/aria-label="([^"]*)"/g)].map(([, label]) =>
    label
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&"),
  );
}

// A lesson hides the radio dock (its own action bar owns the bottom edge),
// and nothing pauses the radio for the lesson's audio. This control is the
// student's only way to stop or resume the stream until the lesson ends.
describe("radio control inside a lesson", () => {
  it("is absent while no station is on", () => {
    expect(renderToStaticMarkup(createElement(RadioSessionToggle))).toBe("");
  });

  it.each([
    ["playing", "to'xtatish"],
    ["loading", "to'xtatish"],
    ["idle", "eshitish"],
    ["error", "qayta ulanish"],
  ] as const)("names the next step for a station that is %s", (status, step) => {
    const html = renderToStaticMarkup(
      createElement(RadioSessionButton, {
        name: "Deutschlandfunk",
        status: status satisfies RadioStatus,
        onToggle: noop,
        onRetry: noop,
      }),
    );
    expect(ariaLabels(html)).toEqual([`Deutschlandfunk — ${step}`]);
  });
});
