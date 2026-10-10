import { describe, expect, it, vi } from "vitest";
import { rowAsButton } from "./task-row-button";

const press = (key: string, nested = false) => {
  const row = {};
  return { key, target: nested ? {} : row, currentTarget: row, preventDefault: vi.fn() };
};

describe("rowAsButton", () => {
  it("is a focusable button with a visible focus ring", () => {
    const props = rowAsButton(() => {});
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props.className).toContain("focus-visible:ring-2");
  });
  it("acts on click, Enter and Space, and only on those", () => {
    const act = vi.fn();
    const props = rowAsButton(act);
    props.onClick();
    const enter = press("Enter");
    props.onKeyDown(enter);
    const space = press(" ");
    props.onKeyDown(space);
    expect(act).toHaveBeenCalledTimes(3);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(space.preventDefault).toHaveBeenCalled(); // Space must not scroll the page

    props.onKeyDown(press("a"));
    props.onKeyDown(press("Tab"));
    expect(act).toHaveBeenCalledTimes(3);
  });
  it("leaves a key pressed inside something nested in the row alone", () => {
    const act = vi.fn();
    const nested = press("Enter", true);
    rowAsButton(act).onKeyDown(nested);
    expect(act).not.toHaveBeenCalled();
    expect(nested.preventDefault).not.toHaveBeenCalled();
  });
});
