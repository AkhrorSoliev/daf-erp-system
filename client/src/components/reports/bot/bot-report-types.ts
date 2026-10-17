/** Where a person the bot stopped stands now (the server decides, ADR-0104). */
export type GateState = "waiting" | "joined" | "left";

export interface BotSummary {
  blocked: number;
  joined: number;
  left: number;
  conversionRate: number;
  waiting: number;
  channelMembers: number | null;
  gateEnabled: boolean;
  channel: string | null;
  month: string;
}

export interface BotRow {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  blockedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  state: GateState;
}

export interface BotList {
  data: BotRow[];
  total: number;
  page: number;
  pageSize: number;
}
