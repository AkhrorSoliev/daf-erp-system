import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AlertDialog, AlertDialogAction } from "./alert-dialog";

/** Class list of the single <button> the markup renders. */
function buttonClasses(child: ReactElement): string[] {
  const html = renderToStaticMarkup(createElement(AlertDialog, { open: false }, child));
  const match = html.match(/<button[^>]*class="([^"]*)"/);
  if (!match) throw new Error(`no button rendered: ${html}`);
  return match[1].split(/\s+/);
}

describe("AlertDialogAction", () => {
  it("renders the destructive variant without the default blue background", () => {
    const classes = buttonClasses(
      createElement(AlertDialogAction, { variant: "destructive" }, "O'chirish"),
    );
    expect(classes).toContain("text-destructive");
    expect(classes).not.toContain("bg-primary");
  });

  // The Slot inside Button asChild joins classes as plain strings, so a
  // className handed to the child used to sit next to bg-primary and lose to
  // it in the stylesheet. It must go through tailwind-merge with the variant.
  it("lets a className background replace the variant's background", () => {
    const classes = buttonClasses(
      createElement(AlertDialogAction, { className: "bg-emerald-600" }, "Tasdiqlash"),
    );
    expect(classes).toContain("bg-emerald-600");
    expect(classes).not.toContain("bg-primary");
  });

  it("keeps its own slot name for styling hooks", () => {
    const html = renderToStaticMarkup(
      createElement(AlertDialog, { open: false }, createElement(AlertDialogAction, null, "Ha")),
    );
    expect(html).toContain('data-slot="alert-dialog-action"');
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("destructive colour tokens", () => {
  // globals.css defines --destructive but no --destructive-foreground, so
  // text-destructive-foreground generates no CSS at all. Use
  // variant="destructive" (or text-white on a solid bg-destructive).
  it("no source file uses the undefined destructive-foreground token", () => {
    const offenders = sourceFiles(path.resolve(__dirname, "../.."))
      .filter((file) => readFileSync(file, "utf8").includes("destructive-foreground"))
      .map((file) => path.relative(path.resolve(__dirname, "../../.."), file));
    expect(offenders).toEqual([]);
  });
});
