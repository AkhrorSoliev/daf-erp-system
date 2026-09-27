import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "./download-file";

describe("filenameFromDisposition", () => {
  it("takes the server's file name", () => {
    expect(
      filenameFromDisposition(
        'attachment; filename="Valiyev-A-10001-26-09-2026.pdf"',
      ),
    ).toBe("Valiyev-A-10001-26-09-2026.pdf");
  });

  it("reads an unquoted name too", () => {
    expect(filenameFromDisposition("attachment; filename=a.pdf")).toBe("a.pdf");
  });

  it("returns null when there is no header or no name", () => {
    expect(filenameFromDisposition(undefined)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
});
