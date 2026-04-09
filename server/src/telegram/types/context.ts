import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSession {
  step: number;
  data: Record<string, any>;
  processing?: boolean;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}
