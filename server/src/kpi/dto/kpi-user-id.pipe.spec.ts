import { BadRequestException } from '@nestjs/common';
import { KpiUserIdPipe } from './kpi-user-id.pipe';

describe('KpiUserIdPipe', () => {
  const pipe = new KpiUserIdPipe();

  it('takes a whole id from 1 to the int4 maximum', () => {
    expect(pipe.transform('11')).toBe(11);
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('2147483647')).toBe(2147483647);
  });

  it.each(['0', '2147483648', '99999999999', '-5', '1.5', '1e3', 'abc', ''])(
    'refuses %p with a 400',
    (raw) => {
      expect(() => pipe.transform(raw)).toThrow(BadRequestException);
    },
  );
});
