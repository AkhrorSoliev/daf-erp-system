import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSession {
  step: number;
  data: Record<string, any>;
  processing?: boolean;
  // Channel-membership gate: cached once the user is confirmed a member of
  // TELEGRAM_REQUIRED_CHANNEL, and the /start payload stashed while the
  // user was being asked to join (so we can offer a one-tap resume).
  channelVerified?: boolean;
  pendingStartPayload?: string;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}
