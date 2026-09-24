import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSession {
  step: number;
  data: Record<string, any>;
  /**
   * Set while a handler works on this chat: `/start` and most scene handlers
   * ignore a chat whose flag is set, so a second tap or message is not run
   * alongside the first. Whoever sets it releases it in a `finally`. Telegraf
   * saves the session even when a handler throws, and every `/start` ignored
   * saves it again, restarting its 24-hour expiry, so a flag left set by a
   * throw shuts the person out of the bot for as long as they keep trying.
   */
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
