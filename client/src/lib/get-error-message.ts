/**
 * Extract a user-facing error message from an API error response.
 *
 * Handles axios errors where the backend returns either a plain string
 * (`message: "..."`) or an array of validation errors (`message: ["...", "..."]`).
 * Returns the first array entry when the body is an array.
 *
 * Usage:
 *   toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  return msg || fallback;
}
