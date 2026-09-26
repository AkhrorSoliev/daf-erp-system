import { execFile, execFileSync } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  TEMPO_MAX,
  TEMPO_MIN,
  tempoFfmpegArgs,
  verlangsameMp3,
} from './audio-tempo';

const execFileAsync = promisify(execFile);

describe('tempoFfmpegArgs', () => {
  it('builds input, atempo filter, mono 44.1 kHz 128k mp3, -y, output (pure function)', () => {
    expect(tempoFfmpegArgs('/tmp/in.mp3', '/tmp/out.mp3', 0.85)).toEqual([
      '-i',
      '/tmp/in.mp3',
      '-af',
      'atempo=0.85',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-y',
      '/tmp/out.mp3',
    ]);
  });
});

describe('verlangsameMp3 factor guard', () => {
  it('refuses a factor outside the single-atempo range before running ffmpeg', async () => {
    await expect(
      verlangsameMp3(Buffer.from('x'), TEMPO_MIN - 0.01),
    ).rejects.toThrow(/0\.5/);
    await expect(
      verlangsameMp3(Buffer.from('x'), TEMPO_MAX + 0.01),
    ).rejects.toThrow(/2/);
    await expect(
      verlangsameMp3(Buffer.from('x'), Number.NaN),
    ).rejects.toThrow();
  });
});

// ffmpeg is looked up when the tests are registered, so a machine without it
// shows the test as skipped instead of green with nothing checked.
function ffmpegMavjud(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const integrationTest = ffmpegMavjud() ? it : it.skip;

async function sekundlar(yol: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    yol,
  ]);
  return Number(stdout.trim());
}

integrationTest(
  'slowing by 0.85 makes a one-second clip about 1/0.85 s long',
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'daf-tempo-spec-'));
    try {
      const kirish = join(dir, 'sinus.mp3');
      await execFileAsync('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-c:a',
        'libmp3lame',
        '-y',
        kirish,
      ]);
      const chiqish = await verlangsameMp3(await readFile(kirish), 0.85);
      const chiqishYoli = join(dir, 'sekin.mp3');
      await writeFile(chiqishYoli, chiqish);
      const s = await sekundlar(chiqishYoli);
      expect(s).toBeGreaterThan(1 / 0.85 - 0.1);
      expect(s).toBeLessThan(1 / 0.85 + 0.1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
