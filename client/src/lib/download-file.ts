import api from "@/lib/api";

/** The file name in a `Content-Disposition` header, or null. */
export function filenameFromDisposition(
  header: string | undefined | null,
): string | null {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match ? match[1].trim() : null;
}

/**
 * A `responseType: "blob"` request turns the server's JSON error into a Blob,
 * so `getErrorMessage` finds no `message`. Reads the Blob back into the parsed
 * JSON (when it is JSON) and returns the same error, so callers keep using
 * `getErrorMessage(err, fallback)` as everywhere else.
 */
export async function readBlobError<E>(err: E): Promise<E> {
  const res = (err as { response?: { data?: unknown } } | null)?.response;
  if (res?.data instanceof Blob) {
    try {
      res.data = JSON.parse(await res.data.text());
    } catch {
      // not JSON: the caller's fallback text is used
    }
  }
  return err;
}

/**
 * Downloads an auth-gated file. An <a href> can't carry the JWT, so the file
 * is fetched as a blob through axios (which attaches the token) and saved
 * under the name the server gives it (`Content-Disposition`, exposed by the
 * API's CORS config), else under `fallbackName`.
 */
export async function downloadAuthedFile(
  path: string,
  fallbackName: string,
): Promise<void> {
  const res = await api
    .get(path, { responseType: "blob" })
    .catch(async (err) => {
      throw await readBlobError(err);
    });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filenameFromDisposition(res.headers["content-disposition"]) ??
    fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Opens an auth-gated PDF in a new tab for printing. The tab is opened
 * before the request, while the click still counts as a user gesture, or the
 * browser blocks it; a blocked tab falls back to a download.
 */
export async function openAuthedFile(
  path: string,
  fallbackName: string,
): Promise<void> {
  const tab = window.open("", "_blank");
  if (!tab) {
    await downloadAuthedFile(path, fallbackName);
    return;
  }
  try {
    const res = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab.close();
    throw await readBlobError(err);
  }
}
