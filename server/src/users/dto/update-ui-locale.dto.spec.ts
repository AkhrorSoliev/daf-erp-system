import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUiLocaleDto } from './update-ui-locale.dto';

const check = (locale: unknown) =>
  validate(plainToInstance(UpdateUiLocaleDto, { locale }));

describe('UpdateUiLocaleDto', () => {
  it.each(['uz', 'uz-Cyrl', 'ru', 'de', 'en'])('accepts %s', async (locale) => {
    expect(await check(locale)).toHaveLength(0);
  });

  it.each(['', 'UZ', 'uz-cyrl', 'fr', 'ru ', undefined, 5])(
    'refuses %p with the Uzbek message',
    async (locale) => {
      const errors = await check(locale);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isIn).toBe("Noma'lum til");
    },
  );
});
