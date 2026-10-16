import { expenseHint } from './expense-hints';

const other = (description: string) =>
  expenseHint({ category: 'OTHER', description });

describe('expenseHint (spec B6 §4.4)', () => {
  it.each([
    ['Farrosh oyligi', 'SALARY'],
    ['Tozalovchi uchun', 'SALARY'],
    ['Qorovulga maosh', 'SALARY'],
    ['Ish haqi qo‘shimcha', 'SALARY'],
    ['Stullar', 'EQUIPMENT'],
    ['Yangi noutbuk', 'EQUIPMENT'],
    ['Proyektor lampasi', 'EQUIPMENT'],
    ['Internet', 'UTILITIES'],
    ['Svet puli', 'UTILITIES'],
    ['Domen uzaytirish', 'UTILITIES'],
  ])('%s → %s', (description, hint) => {
    expect(other(description)).toBe(hint);
  });

  it('only on «Boshqa» rows', () => {
    expect(
      expenseHint({ category: 'UTILITIES', description: 'Internet' }),
    ).toBeNull();
    expect(
      expenseHint({ category: 'EQUIPMENT', description: 'Stul' }),
    ).toBeNull();
    expect(
      expenseHint({ category: 'RENT', description: 'Qorovul xonasi ijarasi' }),
    ).toBeNull();
  });

  it('from the start of a word: «stullar» yes, «pastol» no', () => {
    expect(other('Stullar')).toBe('EQUIPMENT');
    expect(other('Pastol')).toBeNull();
    expect(other('Ofis uchun stol')).toBe('EQUIPMENT');
  });

  it('ignores case', () => {
    expect(other('INTERNET')).toBe('UTILITIES');
    expect(other('sTuL')).toBe('EQUIPMENT');
  });

  it('one hint: SALARY before EQUIPMENT before UTILITIES', () => {
    expect(other('Kompyuter va internet')).toBe('EQUIPMENT');
    expect(other('Internet va avans')).toBe('SALARY');
    expect(other('Oylik va stul')).toBe('SALARY');
  });

  it('an empty description has none; a wrong hint is accepted (CEO decision 5)', () => {
    expect(other('')).toBeNull();
    expect(expenseHint({ category: 'OTHER', description: null })).toBeNull();
    expect(other('Instagram oylik obunasi')).toBe('SALARY');
  });
});
