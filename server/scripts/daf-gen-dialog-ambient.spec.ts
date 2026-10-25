import { readFileSync } from 'fs';
import { join } from 'path';
import { ambientHash, ambientMischPlan } from './daf-gen-dialog-ambient';
import { mischFfmpegArgs } from '../src/daf/media/hoerspiel';

const a = { sfx: 'sports hall', sek: 10 };

describe('ambientMischPlan', () => {
  it('butun dialog bitta bo`lak, ustida fon, qo`shimcha jimlik yo`q', () => {
    const plan = ambientMischPlan(23.5, a);
    expect(plan.gesamt).toBe(23.5);
    expect(plan.clips).toEqual([
      { quelle: 'roh', von: 0, bis: 23.5, at: 0, fern: false, lautstaerke: 1 },
    ]);
    expect(plan.atmo?.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ffmpeg faqat dialog va fon fayllarini oladi', () => {
    const plan = ambientMischPlan(10, a);
    const args = mischFfmpegArgs(plan, {
      roh: 'dialog.mp3',
      geraeusche: new Map([[plan.atmo!.id, 'fon.mp3']]),
      ausgabe: 'out.mp3',
    });
    expect(args.filter((x) => x === '-i')).toHaveLength(2);
    expect(args).toContain('-stream_loop');
  });
});

describe('ambientHash', () => {
  it('fon matni, uzunligi yoki balandligi o`zgarsa — boshqa xesh', () => {
    expect(ambientHash(a)).toBe(ambientHash({ ...a }));
    expect(ambientHash(a)).not.toBe(ambientHash({ ...a, sek: 12 }));
    expect(ambientHash(a)).not.toBe(ambientHash({ ...a, lautstaerke: 0.2 }));
    expect(ambientHash(a)).not.toBe(ambientHash({ ...a, sfx: 'park' }));
  });
});

describe('dialog-ambient.json', () => {
  const ambient = JSON.parse(
    readFileSync(
      join(__dirname, '..', 'content', 'daf', 'a1', 'dialog-ambient.json'),
      'utf8',
    ),
  ) as Record<string, { sfx: string; sek: number; lautstaerke?: number }>;

  it('har yozuvda matn va 0.5–22 soniya oralig`ida davomiylik bor', () => {
    for (const [id, v] of Object.entries(ambient)) {
      expect(v.sfx.trim().length).toBeGreaterThan(0);
      expect(v.sfx.length).toBeLessThanOrEqual(450);
      expect(v.sek).toBeGreaterThanOrEqual(0.5);
      expect(v.sek).toBeLessThanOrEqual(22);
      expect(id).toMatch(/^u\d{2}-d\d+$/);
    }
  });

  it('hoerspiel (to`liq aralashma) bor dialogga qo`shimcha fon berilmaydi', () => {
    const regie = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'content', 'daf', 'a1', 'dialog-regie.json'),
        'utf8',
      ),
    ) as Record<string, { hoerspiel?: unknown }>;
    const ikki = Object.keys(ambient).filter((id) => regie[id]?.hoerspiel);
    expect(ikki).toEqual([]);
  });
});
