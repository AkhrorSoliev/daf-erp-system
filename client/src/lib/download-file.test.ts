import { describe, expect, it } from "vitest";
import { filenameFromDisposition, readBlobError } from "./download-file";
import { getErrorMessage } from "./get-error-message";

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

describe("readBlobError", () => {
  const failed = (data: unknown) => ({ response: { data } });

  it("turns a JSON Blob body into the parsed body, so getErrorMessage finds the message", async () => {
    const err = failed(
      new Blob([JSON.stringify({ message: "Qatorlar juda ko'p (25000)" })]),
    );
    await readBlobError(err);
    expect(getErrorMessage(err, "Excel yuklab olishda xatolik")).toBe(
      "Qatorlar juda ko'p (25000)",
    );
  });

  it("leaves a non-JSON Blob and a plain error alone", async () => {
    const html = failed(new Blob(["<html>502</html>"]));
    await readBlobError(html);
    expect(getErrorMessage(html, "Xatolik")).toBe("Xatolik");
    const plain = failed({ message: "Allaqachon" });
    await readBlobError(plain);
    expect(getErrorMessage(plain, "Xatolik")).toBe("Allaqachon");
    await expect(readBlobError(new Error("net"))).resolves.toBeInstanceOf(Error);
  });
});
