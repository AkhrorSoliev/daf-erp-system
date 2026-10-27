import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { JangJavobDto } from './jang.dto';

const xato = (o: object) =>
  validateSync(plainToInstance(JangJavobDto, o)).length > 0;

describe('JangJavobDto', () => {
  it("to'g'ri tana", () =>
    expect(xato({ pozitsiya: 0, javob: 'Hallo' })).toBe(false));
  it("bo'sh javob ruxsat (vaqt tugadi)", () =>
    expect(xato({ pozitsiya: 5, javob: '' })).toBe(false));
  it('pozitsiya 0–5', () => {
    expect(xato({ pozitsiya: 6, javob: 'x' })).toBe(true);
    expect(xato({ pozitsiya: -1, javob: 'x' })).toBe(true);
  });
  it('uzun javob rad', () =>
    expect(xato({ pozitsiya: 0, javob: 'x'.repeat(201) })).toBe(true));
});
