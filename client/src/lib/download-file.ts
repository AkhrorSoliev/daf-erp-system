import api from "@/lib/api";

/**
 * Downloads an auth-gated file. An <a href> can't carry the JWT, so the file
 * is fetched as a blob through axios (which attaches the token) and saved
 * under `filename`.
 */
export async function downloadAuthedFile(
  path: string,
  filename: string,
): Promise<void> {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
