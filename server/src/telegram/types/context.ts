import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSession {
  step: number;
  data: Record<string, any>;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}
