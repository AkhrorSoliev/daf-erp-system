// Server contract copied field-for-field from server/src/chat/*
// (chat-conversations.service.ts, chat-people.service.ts, chat-access.*).

export type ChatLockReason =
  | "BANNED"
  | "DEBT"
  | "GENDER"
  | "BIRTH_DATE"
  | "PHONE"
  | "QUOTA";

export interface ChatQuotaResult {
  windowDays: number;
  activeMin: number;
  radioMin: number;
  quota: { activeMin: number; radioMin: number };
  ok: boolean;
  missingActiveMin: number;
  missingRadioMin: number;
  tomorrow: { needActiveMin: number; needRadioMin: number } | null;
}

export interface ChatAccess {
  enabled: boolean;
  canWrite: boolean;
  reasons: ChatLockReason[];
  /** One Uzbek sentence per reason, in the same order. */
  messages: string[];
  warning: string | null;
  quota: ChatQuotaResult;
}

export type ChatWho = "EVERYONE" | "GROUPMATES" | "NOBODY";
export type ChatFindWho = "EVERYONE" | "NOBODY";

export interface ChatPrivacy {
  whoCanWrite: ChatWho;
  whoCanFind: ChatFindWho;
  whoSeesPhoto: ChatWho;
}

/** GET /chat/me. */
export interface ChatMe extends ChatPrivacy {
  username: string | null;
  /** Students I blocked. */
  blockedIds: number[];
}

/** What another student may see: never a phone, a debt or a balance. */
export interface PeerSummary {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  photo: string | null;
}

export interface MessageView {
  id: string;
  senderId: number;
  mine: boolean;
  kind: "TEXT" | "IMAGE" | "VOICE";
  text: string | null;
  file: {
    mime: string;
    sizeBytes: number | null;
    durationSec: number | null;
    purged: boolean;
  } | null;
  createdAt: string;
  /** Set once the sender changed the text. */
  editedAt?: string | null;
  /** The message this one answers. */
  replyTo?: ReplyView | null;
}

/** What a reply shows of the message it answers; never a file. */
export interface ReplyView {
  id: string;
  mine: boolean;
  kind: "TEXT" | "IMAGE" | "VOICE";
  preview: string;
  deleted: boolean;
}

export interface ConversationView {
  id: string;
  peer: PeerSummary;
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  unread: number;
}

/** One page of GET /chat/conversations/:id/messages, newest first. */
export interface MessagesPage {
  data: MessageView[];
  nextCursor: string | null;
}

export type OpenConversationBody = { username: string } | { studentId: number };
