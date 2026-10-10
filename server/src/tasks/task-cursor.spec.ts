import { cursorWhere, decodeCursor, encodeCursor } from './task-cursor';
describe('task cursor', () => {
  it('round-trips', () => {
    const row = { createdAt: new Date('2026-10-07T05:00:00.000Z'), id: 'abc' };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });
  it('rejects junk', () => {
    expect(decodeCursor('zzz')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
  it('continues strictly after the cursor row, ties broken by id', () => {
    const at = new Date('2026-10-07T05:00:00.000Z');
    expect(cursorWhere({ createdAt: at, id: 'abc' })).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'abc' } }],
    });
  });
});
