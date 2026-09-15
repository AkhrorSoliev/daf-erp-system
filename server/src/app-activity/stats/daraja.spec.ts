import { darajaQatorlari, guruhDarajasi, joriyDaraja } from './daraja';

const jami = { A1: 192, A2: 0, B1: 0 };

describe('daraja', () => {
  it('guruhDarajasi matndan', () => {
    expect(guruhDarajasi('A1')).toBe('A1');
    expect(guruhDarajasi('a2.1')).toBe('A2');
    expect(guruhDarajasi('Intensiv')).toBeNull();
    expect(guruhDarajasi(null)).toBeNull();
  });

  it('darajaQatorlari holatlari', () => {
    const q = darajaQatorlari({ A1: 37 }, { A1: 192, A2: 10 });
    expect(q).toEqual([
      { daraja: 'A1', tugatilgan: 37, jami: 192, holat: 'DAVOM' },
      { daraja: 'A2', tugatilgan: 0, jami: 10, holat: 'BOSHLANMAGAN' },
      { daraja: 'B1', tugatilgan: 0, jami: 0, holat: 'KURS_YOQ' },
    ]);
  });

  it('LESSON seansi yo`q — guruh darajasi, u ham yo`q — A1', () => {
    expect(
      joriyDaraja({
        oxirgiDarsDarajasi: null,
        guruhDarajasi: 'A2',
        tugatilgan: {},
        jami,
      }).daraja,
    ).toBe('A2');
    expect(
      joriyDaraja({
        oxirgiDarsDarajasi: null,
        guruhDarajasi: null,
        tugatilgan: {},
        jami,
      }).daraja,
    ).toBe('A1');
  });

  it('A1 tugatilgan, A2 da kurs bor — A2 boshlanmagan', () => {
    const j = joriyDaraja({
      oxirgiDarsDarajasi: 'A1',
      guruhDarajasi: 'A1',
      tugatilgan: { A1: 5 },
      jami: { A1: 5, A2: 8 },
    });
    expect(j).toMatchObject({
      daraja: 'A2',
      holat: 'BOSHLANMAGAN',
      tugatilgan: 0,
      jami: 8,
      guruhdanOrqada: false,
    });
  });

  it('A1 tugatilgan, A2 da kurs yo`q — A1 tugatilgan', () => {
    const j = joriyDaraja({
      oxirgiDarsDarajasi: 'A1',
      guruhDarajasi: 'A1',
      tugatilgan: { A1: 5 },
      jami: { A1: 5 },
    });
    expect(j).toMatchObject({ daraja: 'A1', holat: 'TUGATILGAN' });
  });

  it('guruhdan orqada: joriy A1, guruh A2', () => {
    const j = joriyDaraja({
      oxirgiDarsDarajasi: 'A1',
      guruhDarajasi: 'A2',
      tugatilgan: { A1: 3 },
      jami,
    });
    expect(j).toMatchObject({
      daraja: 'A1',
      holat: 'DAVOM',
      guruhdanOrqada: true,
    });
  });

  it('kurs yo`q daraja', () => {
    expect(
      joriyDaraja({
        oxirgiDarsDarajasi: null,
        guruhDarajasi: 'B1',
        tugatilgan: {},
        jami,
      }).holat,
    ).toBe('KURS_YOQ');
  });
});
