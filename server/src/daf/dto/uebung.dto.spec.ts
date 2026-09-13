import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AbschlussDto,
  CheckAntwortDto,
  JuftDto,
  FRAGE_FORMATLAR,
  ITEM_TYPEN,
  WiederholungAbschlussDto,
} from './uebung.dto';

/**
 * `FRAGE_FORMATLAR` — `CheckAntwortDto.format` va
 * `ErsatzQueryDto.nichtFormat` uchun `@IsIn` ro'yxati.
 *
 * TO'LIQLIKNI ENDI KOMPILYATOR KAFOLATLAYDI (`uebung.dto.ts`dagi
 * `Record<FrageFormat, true>` orqali) — shuning uchun bu yerda uzunlik
 * pinlanmaydi: qattiq sonli `toHaveLength` faqat keyingi ishlab
 * chiquvchini sonni yangilashga majburlardi, hech qanday himoya
 * bermasdan. Bu test faqat `@IsIn` simida ikkala yangi format haqiqatda
 * BORLIGINI tekshiradi — massivning o'zi to'g'ri quruvchidan
 * (`ALLE_FRAGE_FORMATLAR`) kelayotganini kompilyator allaqachon
 * ta'minlagan.
 */
describe('FRAGE_FORMATLAR', () => {
  it("AUDIO_WORT va WORT_TIPPEN ro'yxatda bor — @IsIn simi ikkalasini ham qamraydi", () => {
    expect(FRAGE_FORMATLAR).toEqual(
      expect.arrayContaining(['AUDIO_WORT', 'WORT_TIPPEN']),
    );
  });
});

describe('ITEM_TYPEN', () => {
  it("HOERFRAGE ro'yxatda bor — @IsIn simi eshitish javobini rad etmaydi", () => {
    // Ilgari bu ro'yxat ikki DTO'da QO'LDA yozilgan edi; unutilsa har
    // eshitish javobi 400 bilan qaytardi — aynan AUDIO_WORT bilan
    // bo'lgan xato, faqat itemType tomonida.
    expect(ITEM_TYPEN).toEqual(
      expect.arrayContaining([
        'WORT',
        'SATZ',
        'PHRASE',
        'DIALOGZEILE',
        'HOERFRAGE',
      ]),
    );
  });
});

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

describe('seans maydonlari', () => {
  it('CheckAntwortDto: seans maydonlarisiz ham o`tadi (eski klient)', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CheckAntwortDto: to`liq seans maydonlari o`tadi', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
      sessionId: UUID, questionIndex: 3, attemptNo: 2, lessonId: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CheckAntwortDto: uuid bo`lmagan sessionId, attemptNo 3, manfiy questionIndex rad etiladi', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
      sessionId: 'seans-1', questionIndex: -1, attemptNo: 3,
    });
    const xatolar = await validate(dto);
    expect(xatolar.map((x) => x.property).sort()).toEqual(
      ['attemptNo', 'questionIndex', 'sessionId'],
    );
  });

  it('JuftDto ham seans maydonlarini qabul qiladi', async () => {
    const dto = plainToInstance(JuftDto, {
      itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'Haus', ong: 'uy',
      sessionId: UUID, questionIndex: 0, attemptNo: 1, lessonId: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('AbschlussDto.sessionId ixtiyoriy, WiederholungAbschlussDto.sessionId majburiy', async () => {
    expect(await validate(plainToInstance(AbschlussDto, { richtig: 9, gesamt: 12 }))).toHaveLength(0);
    expect(await validate(plainToInstance(AbschlussDto, { richtig: 9, gesamt: 12, sessionId: UUID }))).toHaveLength(0);
    expect(await validate(plainToInstance(WiederholungAbschlussDto, {}))).toHaveLength(1);
    expect(await validate(plainToInstance(WiederholungAbschlussDto, { sessionId: UUID }))).toHaveLength(0);
  });
});
