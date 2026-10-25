import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLernenTemaDto } from './update-lernen-tema.dto';

const check = (tema: unknown) =>
  validate(plainToInstance(UpdateLernenTemaDto, { tema }));

describe('UpdateLernenTemaDto', () => {
  it.each(['toza', 'ormon', 'dengiz', 'alp'])('accepts %s', async (tema) => {
    expect(await check(tema)).toHaveLength(0);
  });

  it.each(['', 'TOZA', 'neon', 'toza ', undefined, 5])(
    'refuses %p',
    async (tema) => {
      expect(await check(tema)).toHaveLength(1);
    },
  );
});
