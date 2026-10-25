import { Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { withProcessingLock } from '../utils/processing-lock';
import {
  ProfileDeps,
  submitBirthDate,
} from '../profile-request/profile-request.handlers';
import {
  CANCELLED,
  buildCancelKeyboard,
  DATE_PROMPT,
} from '../profile-request/profile-request-text';

/**
 * Tug'ilgan sana kutadigan kichik scene. Tugma bosilganda
 * `ctx.scene.enter(PROFILE_FILL, { studentId })` bilan ochiladi; to'g'ri sana
 * yozilguncha yoki /cancel gacha ochiq turadi.
 */
export function createProfileFillScene(
  deps: ProfileDeps,
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>(SCENES.PROFILE_FILL);

  scene.enter(async (ctx) => {
    await ctx.reply(DATE_PROMPT, buildCancelKeyboard());
  });

  scene.action('pf:x', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(CANCELLED);
    await ctx.scene.leave();
  });

  scene.command('cancel', async (ctx) => {
    await ctx.reply(CANCELLED);
    await ctx.scene.leave();
  });

  scene.on(message('text'), async (ctx) => {
    if (ctx.session.processing) return;
    const studentId = (ctx.scene.state as { studentId?: number }).studentId;
    if (!studentId) {
      await ctx.scene.leave();
      return;
    }
    await withProcessingLock(ctx, async () => {
      const result = await submitBirthDate(
        deps,
        ctx,
        studentId,
        ctx.message.text,
      );
      if (result === 'done') await ctx.scene.leave();
    });
  });

  return scene;
}
