import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUiSkinDto } from './update-ui-skin.dto';

const check = (skin: unknown) =>
  validate(plainToInstance(UpdateUiSkinDto, { skin }));

describe('UpdateUiSkinDto', () => {
  it.each(['daftar', 'ormon', 'gilos', 'grafit', 'qum'])(
    'accepts %s',
    async (skin) => {
      expect(await check(skin)).toHaveLength(0);
    },
  );

  it.each(['', 'DAFTAR', 'neon', 'qum ', undefined, 5])(
    'refuses %p',
    async (skin) => {
      const errors = await check(skin);
      expect(errors).toHaveLength(1);
    },
  );
});
