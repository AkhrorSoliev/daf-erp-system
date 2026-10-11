import { pickAttachment, UNSUPPORTED_MEDIA } from './task-telegram-media';
import { FILE_SIZE_MESSAGE, VOICE_LIMIT_MESSAGE } from '../task-file-rules';

const m = (x: object) =>
  ({ message_id: 1, date: 1, chat: { id: 1, type: 'private' }, ...x }) as never;
const MB = 1024 * 1024;

it('a photo: the largest size, «rasm.jpg»', () => {
  expect(
    pickAttachment(
      m({
        photo: [
          { file_id: 's', file_size: 10 },
          { file_id: 'L', file_size: 900 },
        ],
      }),
    ),
  ).toEqual({ fileId: 'L', name: 'rasm.jpg' });
});
it('a document keeps its name; a video too; a voice gets its length', () => {
  expect(
    pickAttachment(
      m({
        document: { file_id: 'd', file_name: 'Hisobot.pdf', file_size: 100 },
      }),
    ),
  ).toEqual({ fileId: 'd', name: 'Hisobot.pdf' });
  expect(pickAttachment(m({ document: { file_id: 'd' } }))).toEqual({
    fileId: 'd',
    name: 'fayl',
  });
  expect(pickAttachment(m({ video: { file_id: 'v', duration: 9 } }))).toEqual({
    fileId: 'v',
    name: 'video.mp4',
  });
  expect(
    pickAttachment(
      m({ voice: { file_id: 'o', duration: 42, file_size: 1000 } }),
    ),
  ).toEqual({ fileId: 'o', name: 'ovozli-xabar.ogg', durationSec: 42 });
});
it('refused before downloading: over 20 MB, a voice over 3 minutes', () => {
  expect(
    pickAttachment(m({ document: { file_id: 'd', file_size: 21 * MB } })),
  ).toEqual({ refused: FILE_SIZE_MESSAGE });
  expect(
    pickAttachment(m({ photo: [{ file_id: 'L', file_size: 21 * MB }] })),
  ).toEqual({ refused: FILE_SIZE_MESSAGE });
  expect(pickAttachment(m({ voice: { file_id: 'o', duration: 181 } }))).toEqual(
    {
      refused: VOICE_LIMIT_MESSAGE,
    },
  );
});
it('a text is not an attachment; a sticker, an audio track, a round video are refused', () => {
  expect(pickAttachment(m({ text: 'salom' }))).toBeNull();
  for (const x of [
    { sticker: { file_id: 's' } },
    { audio: { file_id: 'a' } },
    { video_note: { file_id: 'n' } },
    { location: {} },
  ]) {
    expect(pickAttachment(m(x))).toEqual({ refused: UNSUPPORTED_MEDIA });
  }
});
