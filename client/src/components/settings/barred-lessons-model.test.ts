import { describe, expect, it } from "vitest";
import {
  BARRED_ITEMS,
  canTurnOn,
  flagsFromSettings,
  patchFor,
  toggled,
  type BarredFlags,
} from "./barred-lessons-model";

const start: BarredFlags = {
  mark: true,
  nudge: false,
  warn: false,
  autoPause: false,
  pauseNotice: false,
  restoreDialog: false,
  logOnly: true,
};

describe("barred-lessons-model", () => {
  it("reads the seven server keys", () => {
    const flags = flagsFromSettings({
      "absence.barred.mark": true,
      "absence.barred.nudge": false,
      "absence.barred.warn": true,
      "absence.barred.autoPause": false,
      "absence.barred.pauseNotice": false,
      "absence.barred.restoreDialog": true,
      "absence.barred.logOnly": false,
    });
    expect(flags).toEqual({
      mark: true,
      nudge: false,
      warn: true,
      autoPause: false,
      pauseNotice: false,
      restoreDialog: true,
      logOnly: false,
    });
  });

  it("lists every flag once, with its requirement", () => {
    expect(BARRED_ITEMS.map((i) => i.id)).toEqual([
      "mark",
      "nudge",
      "warn",
      "autoPause",
      "pauseNotice",
      "restoreDialog",
      "logOnly",
    ]);
    expect(BARRED_ITEMS.find((i) => i.id === "pauseNotice")?.requires).toBe(
      "autoPause",
    );
  });

  it("turns a dependent on only when its requirement is on", () => {
    expect(canTurnOn(start, "nudge")).toBe(true);
    expect(canTurnOn(start, "pauseNotice")).toBe(false);
    expect(canTurnOn({ ...start, autoPause: true }, "pauseNotice")).toBe(true);
    expect(canTurnOn({ ...start, mark: false }, "nudge")).toBe(false);
  });

  it("refuses to switch on a dependent without its requirement", () => {
    expect(toggled(start, "pauseNotice")).toEqual(start);
  });

  it("switching a parent off switches its dependents off, recursively", () => {
    const all: BarredFlags = {
      ...start,
      nudge: true,
      warn: true,
      autoPause: true,
      pauseNotice: true,
      restoreDialog: true,
    };
    expect(toggled(all, "mark")).toEqual({
      mark: false,
      nudge: false,
      warn: false,
      autoPause: false,
      pauseNotice: false,
      restoreDialog: false,
      logOnly: true,
    });
    const noPause = toggled(all, "autoPause");
    expect(noPause.pauseNotice).toBe(false);
    expect(noPause.nudge).toBe(true);
  });

  it("log-only stands on its own", () => {
    expect(toggled({ ...start, mark: false }, "logOnly").logOnly).toBe(false);
  });

  it("sends only the keys that changed, with the API's names", () => {
    const next = toggled(start, "nudge");
    expect(patchFor(start, next)).toEqual({ barredNudge: true });
    const off = toggled({ ...next, autoPause: true, pauseNotice: true }, "mark");
    expect(patchFor({ ...next, autoPause: true, pauseNotice: true }, off)).toEqual({
      barredMark: false,
      barredNudge: false,
      barredAutoPause: false,
      barredPauseNotice: false,
    });
  });
});
