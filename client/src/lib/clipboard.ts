/**
 * Copies text that is still being fetched, such as a link the server mints
 * for the click that asked for it.
 *
 * A clipboard write is allowed only close to the click that asked for it:
 * Safari (and so every browser on iOS) while that click is being handled,
 * Firefox for a few seconds after it. The request that produces the text can
 * finish later than that, so awaiting it and then calling `writeText` is
 * refused. A `ClipboardItem` accepts a promise instead: the write starts
 * inside the click and completes when the text arrives. Browsers without
 * `ClipboardItem` (Firefox before 127) get the text written once it has
 * arrived, which works when it arrives within those few seconds.
 *
 * Call it synchronously from the click handler, before any `await`.
 *
 * Resolves to the text that was copied, or null when `text` resolved to null
 * and nothing was written. Rejects when the browser refuses the write.
 */
export async function copyPendingText(
  text: Promise<string | null>,
  clipboard: Clipboard = navigator.clipboard,
): Promise<string | null> {
  if (typeof ClipboardItem === "undefined") {
    const value = await text;
    if (value !== null) await clipboard.writeText(value);
    return value;
  }

  const blob = text.then((value) => {
    if (value === null) throw new Error("Nothing to copy");
    return new Blob([value], { type: "text/plain" });
  });
  // A browser may refuse the write without ever reading this promise; this
  // handler keeps its rejection from going unhandled.
  blob.catch(() => {});

  try {
    await clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  } catch (error) {
    if ((await text) === null) return null;
    throw error;
  }
  return text;
}
