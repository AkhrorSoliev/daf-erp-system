// Limits mirror server/src/chat/media/chat-file-rules.ts and
// server/src/chat/chat.constants.ts; chat-media.test.ts fails when they differ.
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_MAX_SEC = 120;
export const CHAT_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_ACCEPT = CHAT_IMAGE_MIMES.join(",");
/** Signed links last 10 minutes (SIGNED_URL_SECONDS); renewed after 8. */
export const SIGNED_URL_STALE_MS = 8 * 60 * 1000;

type Tr = (s: string) => string;
const same: Tr = (s) => s;

/** null = fine, otherwise the Uzbek reason. The server checks the bytes again. */
export function checkImage(
  file: { type: string; size: number },
  t: Tr = same,
): string | null {
  if (!CHAT_IMAGE_MIMES.includes(file.type))
    return t("Faqat rasm (JPG, PNG, WebP) yuborish mumkin");
  if (file.size > IMAGE_MAX_BYTES)
    return t("Rasm hajmi 5 MB dan oshmasligi kerak");
  return null;
}

const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];

/** null = this browser records nothing the server takes (hide the mic). */
export function voiceMime(isSupported: (type: string) => boolean): string | null {
  return VOICE_MIMES.find((m) => isSupported(m)) ?? null;
}

export function voiceFileName(mime: string): string {
  return mime.startsWith("audio/ogg") ? "ovozli-xabar.ogg" : "ovozli-xabar.webm";
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
