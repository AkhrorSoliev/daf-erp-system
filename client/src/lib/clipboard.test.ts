import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyPendingText, tryCopyPendingText } from "./clipboard";

const LINK = "https://t.me/daf_test_bot?start=employee_7_roles_4_t_sy2k1c_sig_abc";

/** Shaped like the axios error a failed request rejects with. */
const REQUEST_ERROR = Object.assign(new Error("Request failed with status code 400"), {
  isAxiosError: true,
  response: { status: 400, data: { message: "Tanlangan lavozimlar noto'g'ri" } },
});

/** A promise the test settles by hand, to control when the link "arrives". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** The part of the browser's ClipboardItem that a clipboard reads back. */
class FakeClipboardItem {
  constructor(private readonly data: Record<string, Promise<Blob>>) {}
  getType(type: string): Promise<Blob> {
    return this.data[type];
  }
}

/**
 * Behaves like the browser: `write` waits for the item's data and rejects
 * when that data rejects; `refuse` makes every write fail the way a browser
 * that withholds permission does.
 */
class FakeClipboard {
  text: string | null = null;
  writeCalls = 0;
  writeTextCalls = 0;
  refuse = false;

  async write(items: FakeClipboardItem[]): Promise<void> {
    this.writeCalls += 1;
    const blob = await items[0].getType("text/plain");
    if (this.refuse) throw new DOMException("Write refused", "NotAllowedError");
    this.text = await blob.text();
  }

  async writeText(text: string): Promise<void> {
    this.writeTextCalls += 1;
    if (this.refuse) throw new DOMException("Write refused", "NotAllowedError");
    this.text = text;
  }
}

const asClipboard = (fake: FakeClipboard) => fake as unknown as Clipboard;

describe("copyPendingText — where ClipboardItem exists (Safari, Chromium, Firefox 127+)", () => {
  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the write while the click is still being handled, before the link arrives", async () => {
    // Safari refuses a write that begins after the click handler has
    // returned — for instance one that first awaits the request minting the link.
    const link = deferred<string | null>();
    const clipboard = new FakeClipboard();

    const copying = copyPendingText(link.promise, asClipboard(clipboard));
    expect(clipboard.writeCalls).toBe(1);

    link.resolve(LINK);
    await expect(copying).resolves.toBe(LINK);
    expect(clipboard.text).toBe(LINK);
  });

  it("writes nothing and resolves null when no link could be minted", async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = "whatever was copied before";

    await expect(
      copyPendingText(Promise.resolve(null), asClipboard(clipboard)),
    ).resolves.toBeNull();
    expect(clipboard.text).toBe("whatever was copied before");
  });

  it("rejects when the browser refuses the write, so the caller never reports a copy that did not happen", async () => {
    const clipboard = new FakeClipboard();
    clipboard.refuse = true;

    await expect(
      copyPendingText(Promise.resolve(LINK), asClipboard(clipboard)),
    ).rejects.toThrow("Write refused");
    expect(clipboard.text).toBeNull();
  });

  it("leaves no unhandled rejection when the browser refuses before reading the item", async () => {
    // A browser may refuse at call time without ever reading the item's
    // data; the link then resolves (here to null) with nobody listening.
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const refusesAtOnce = {
        write: () => Promise.reject(new DOMException("Write refused", "NotAllowedError")),
      } as unknown as Clipboard;

      await expect(
        copyPendingText(Promise.resolve(null), refusesAtOnce),
      ).resolves.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("copyPendingText — where ClipboardItem is missing", () => {
  it("writes the link once it arrives", async () => {
    // Node has no ClipboardItem, so this branch runs unstubbed.
    const link = deferred<string | null>();
    const clipboard = new FakeClipboard();

    const copying = copyPendingText(link.promise, asClipboard(clipboard));
    link.resolve(LINK);

    await expect(copying).resolves.toBe(LINK);
    expect(clipboard.text).toBe(LINK);
    expect(clipboard.writeCalls).toBe(0);
  });

  it("writes nothing and resolves null when no link could be minted", async () => {
    const clipboard = new FakeClipboard();

    await expect(
      copyPendingText(Promise.resolve(null), asClipboard(clipboard)),
    ).resolves.toBeNull();
    expect(clipboard.writeTextCalls).toBe(0);
  });

  it("rejects when the browser refuses the write", async () => {
    const clipboard = new FakeClipboard();
    clipboard.refuse = true;

    await expect(
      copyPendingText(Promise.resolve(LINK), asClipboard(clipboard)),
    ).rejects.toThrow("Write refused");
  });
});

describe("tryCopyPendingText — where ClipboardItem exists (Safari, Chromium, Firefox 127+)", () => {
  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the write while the click is still being handled, before the text arrives", async () => {
    const link = deferred<string | null>();
    const clipboard = new FakeClipboard();

    const copying = tryCopyPendingText(link.promise, asClipboard(clipboard));
    expect(clipboard.writeCalls).toBe(1);

    link.resolve(LINK);
    await expect(copying).resolves.toEqual({ status: "copied", text: LINK });
    expect(clipboard.text).toBe(LINK);
  });

  it("reports a refused write together with the text, so the caller can still show it", async () => {
    // The link dialog used to report "Havola yaratishda xatolik" here,
    // although the link had been created.
    const clipboard = new FakeClipboard();
    clipboard.refuse = true;

    await expect(
      tryCopyPendingText(Promise.resolve(LINK), asClipboard(clipboard)),
    ).resolves.toEqual({ status: "refused", text: LINK });
    expect(clipboard.text).toBeNull();
  });

  it("reports a failed request with the request's own error, so its message can be shown", async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = "whatever was copied before";

    await expect(
      tryCopyPendingText(Promise.reject(REQUEST_ERROR), asClipboard(clipboard)),
    ).resolves.toEqual({ status: "failed", error: REQUEST_ERROR });
    expect(clipboard.text).toBe("whatever was copied before");
  });

  it("reports text that resolved to null as empty and writes nothing", async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = "whatever was copied before";

    await expect(
      tryCopyPendingText(Promise.resolve(null), asClipboard(clipboard)),
    ).resolves.toEqual({ status: "empty" });
    expect(clipboard.text).toBe("whatever was copied before");
  });

  it("leaves no unhandled rejection when the request fails", async () => {
    // The copy started inside the click rejects too when the request fails;
    // nobody awaits it once the failure has been reported.
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      await tryCopyPendingText(
        Promise.reject(REQUEST_ERROR),
        asClipboard(new FakeClipboard()),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("tryCopyPendingText — where ClipboardItem is missing", () => {
  it("reports a refused write together with the text", async () => {
    const clipboard = new FakeClipboard();
    clipboard.refuse = true;

    await expect(
      tryCopyPendingText(Promise.resolve(LINK), asClipboard(clipboard)),
    ).resolves.toEqual({ status: "refused", text: LINK });
  });

  it("reports a failed request with the request's own error and writes nothing", async () => {
    const clipboard = new FakeClipboard();

    await expect(
      tryCopyPendingText(Promise.reject(REQUEST_ERROR), asClipboard(clipboard)),
    ).resolves.toEqual({ status: "failed", error: REQUEST_ERROR });
    expect(clipboard.writeTextCalls).toBe(0);
  });
});
