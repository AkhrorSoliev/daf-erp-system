export const CHAT_OFF_MESSAGE = 'Chat hozircha ochilmagan';
export const MESSAGE_MAX = 2000;
export const RATE_PER_MINUTE = 30;
/** New conversations per student per minute (stops id enumeration by opening). */
export const OPEN_PER_MINUTE = 10;
/** The same words for a block and a privacy refusal: a block is never revealed. */
export const RESTRICTED_MESSAGE = "Bu o'quvchi sizga yozishni cheklagan";
export const I_BLOCKED_MESSAGE =
  "Siz bu o'quvchini bloklagansiz. Avval blokdan chiqaring";
export const RATE_MESSAGE = 'Juda tez yozyapsiz. Biroz kuting';
export const CHAT_FILES_OFF_MESSAGE = "Fayl yuborish hozircha o'chiq";
export const CHAT_FILE_GONE_MESSAGE = "Fayl o'chirilgan";
export const REPORT_DUPLICATE_MESSAGE = 'Shikoyat allaqachon yuborilgan';
/** Files of a conversation nobody has opened for this long are purged. */
export const PURGE_INACTIVE_DAYS = 30;
export const PURGE_BATCH = 200;
/** A report keeps this many of the latest messages. */
export const REPORT_SNAPSHOT_SIZE = 50;
