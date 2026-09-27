import { execFile, execFileSync } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { bildFfmpegArgs, verkleinereBild } from './bild-verkleinern';

const execFileAsync = promisify(execFile);

describe('bildFfmpegArgs', () => {
  it('scales to a square of px and writes a JPEG at quality 4 (pure function)', () => {
    expect(bildFfmpegArgs('/tmp/in.jpg', '/tmp/out.jpg', 512)).toEqual([
      '-i',
      '/tmp/in.jpg',
      '-vf',
      'scale=512:512',
      '-q:v',
      '4',
      '-y',
      '/tmp/out.jpg',
    ]);
  });
});

describe('verkleinereBild size guard', () => {
  it('refuses a size that is not a positive whole number before running ffmpeg', async () => {
    await expect(verkleinereBild(Buffer.from('x'), 0)).rejects.toThrow(/0/);
    await expect(verkleinereBild(Buffer.from('x'), 12.5)).rejects.toThrow();
  });
});

// Looked up when the tests are registered, so a machine without ffmpeg
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

integrationTest('a 64 px picture comes back as a 32 px JPEG', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'daf-bild-spec-'));
  try {
    const kirish = join(dir, 'rot.jpg');
    await execFileAsync('ffmpeg', [
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x64',
      '-frames:v',
      '1',
      '-y',
      kirish,
    ]);
    const chiqish = await verkleinereBild(await readFile(kirish), 32);
    expect(chiqish[0]).toBe(0xff);
    expect(chiqish[1]).toBe(0xd8);

    const chiqishYoli = join(dir, 'klein.jpg');
    await writeFile(chiqishYoli, chiqish);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      chiqishYoli,
    ]);
    expect(stdout.trim()).toBe('32,32');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
