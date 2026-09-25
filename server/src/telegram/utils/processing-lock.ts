import { BotContext } from '../types/context';

/**
 * Runs `work` with `ctx.session.processing` set, and releases it on every way
 * out, a throw included: see `SessionData.processing`. The throw itself is not
 * caught, so Telegraf's error handler still logs it.
 */
export async function withProcessingLock(
  ctx: Pick<BotContext, 'session'>,
  work: () => Promise<void>,
): Promise<void> {
  ctx.session.processing = true;
  try {
    await work();
  } finally {
    ctx.session.processing = false;
  }
}
