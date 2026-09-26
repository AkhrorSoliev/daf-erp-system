import api from "@/lib/api";

/** The file name in a `Content-Disposition` header, or null. */
export function filenameFromDisposition(
  header: string | undefined | null,
): string | null {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match ? match[1].trim() : null;
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
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filenameFromDisposition(res.headers["content-disposition"]) ??
    fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}
