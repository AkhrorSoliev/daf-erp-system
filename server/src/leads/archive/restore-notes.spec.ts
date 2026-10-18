import { LeadStatus } from '@prisma/client';
import { restoreNotes } from './restore-notes';

const plain = {
  statusEnum: LeadStatus.NEW,
  convertedStudentId: null,
  ownerId: null,
};

describe('restoreNotes', () => {
  it('says nothing for a plain lead', () => {
    expect(restoreNotes(plain)).toEqual([]);
  });

  it('tells that a lost lead returns to NEW and loses its reason', () => {
    expect(restoreNotes({ ...plain, statusEnum: LeadStatus.LOST })).toEqual([
      "Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.",
    ]);
  });

  it('tells that the owner is released', () => {
    expect(restoreNotes({ ...plain, ownerId: 7 })).toEqual([
      "Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.",
    ]);
  });

  it('lists both notes, the lost one first', () => {
    expect(
      restoreNotes({ ...plain, statusEnum: LeadStatus.LOST, ownerId: 7 }),
    ).toHaveLength(2);
  });

  it('keeps a converted lead as it is: no notes', () => {
    expect(
      restoreNotes({
        statusEnum: LeadStatus.CONVERTED,
        convertedStudentId: 10001,
        ownerId: 7,
      }),
    ).toEqual([]);
  });
});
