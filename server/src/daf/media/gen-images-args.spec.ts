import { MissingUnitArgError, parseGenImagesArgs } from './gen-images-args';

describe('parseGenImagesArgs', () => {
  it('--unit bo`lmasa yiqiladi', () => {
    expect(() => parseGenImagesArgs([])).toThrow(MissingUnitArgError);
  });

  it('--unit qiymatsiz berilsa yiqiladi', () => {
    expect(() => parseGenImagesArgs(['--unit'])).toThrow(MissingUnitArgError);
  });

  // `--unit --dry-run` — keyingi bayroq qiymat sifatida qabul
  // qilinmasligi kerak, aks holda skript noto'g'ri bo'limga ishlab ketadi.
  it('--unit keyidan boshqa bayroq kelsa qiymat deb olmaydi', () => {
    expect(() => parseGenImagesArgs(['--unit', '--dry-run'])).toThrow(
      MissingUnitArgError,
    );
  });

  it('--unit sonsiz qiymat bilan berilsa yiqiladi', () => {
    expect(() => parseGenImagesArgs(['--unit', 'abc'])).toThrow(
      MissingUnitArgError,
    );
  });

  it('--unit 0 yoki manfiy bilan berilsa yiqiladi', () => {
    expect(() => parseGenImagesArgs(['--unit', '0'])).toThrow(
      MissingUnitArgError,
    );
    expect(() => parseGenImagesArgs(['--unit', '-3'])).toThrow(
      MissingUnitArgError,
    );
  });

  it('to`g`ri --unit bilan bo`lim raqamini qaytaradi', () => {
    expect(parseGenImagesArgs(['--unit', '12'])).toEqual({
      unit: 12,
      dryRun: false,
    });
  });

  it('--dry-run bayrog`ini o`qiydi', () => {
    expect(parseGenImagesArgs(['--unit', '12', '--dry-run'])).toEqual({
      unit: 12,
      dryRun: true,
    });
  });
});
