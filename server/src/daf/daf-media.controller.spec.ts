import { Test, TestingModule } from '@nestjs/testing';
import { DafMediaController } from './daf-media.controller';
import { DafMediaOverviewService } from './media/daf-media-overview.service';
import { DafMediaCoverageService } from './media/daf-media-coverage.service';
import { DafMediaInhaltService } from './media/daf-media-inhalt.service';
import { DafMediaFragenService } from './media/daf-media-fragen.service';
import { DafMediaJangService } from './media/daf-media-jang.service';
import { UebungService } from './uebung/uebung.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

/**
 * Roldan tashqari, `coverage()` haqiqatan ham yangi xizmatga delegatsiya
 * qilishini ham tekshiradi — aks holda ikkala endpoint bir xil eski
 * manifestni qaytarib qolishi mumkin edi.
 */
describe('DafMediaController — route access', () => {
  let controller: DafMediaController;

  const overviewService = {
    overview: jest.fn().mockReturnValue({ vorhanden: false }),
  };
  const coverageService = {
    coverage: jest.fn().mockResolvedValue({ levels: [] }),
  };
  const inhaltService = {
    inhalt: jest.fn().mockResolvedValue({
      woerter: [],
      saetze: [],
      phrasen: [],
      dialogZeilen: [],
    }),
  };
  const fragenService = {
    lessonFragen: jest
      .fn()
      .mockResolvedValue({ kind: null, laenge: 12, bevorzugt: [], fragen: [] }),
  };
  const uebungService = {
    seans: jest.fn().mockResolvedValue([]),
    ersatz: jest.fn().mockResolvedValue(null),
    pruefen: jest.fn().mockResolvedValue({ isCorrect: true, richtig: 'x' }),
    juft: jest.fn().mockResolvedValue({ isCorrect: true }),
  };
  const jangService = {
    jang: jest.fn().mockResolvedValue({ units: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DafMediaController],
      providers: [
        { provide: DafMediaOverviewService, useValue: overviewService },
        { provide: DafMediaCoverageService, useValue: coverageService },
        { provide: DafMediaInhaltService, useValue: inhaltService },
        { provide: DafMediaFragenService, useValue: fragenService },
        { provide: DafMediaJangService, useValue: jangService },
        { provide: UebungService, useValue: uebungService },
      ],
    }).compile();

    controller = module.get(DafMediaController);
  });

  it('every route is gated by the media view capability', () => {
    for (const method of [
      'coverage',
      'overview',
      'inhalt',
      'jang',
      'lessonFragen',
      'sinov',
      'sinovErsatz',
      'sinovCheck',
      'sinovJuft',
    ]) {
      expect(routeAccess(DafMediaController, method)).toEqual({
        kind: 'can',
        keys: ['media.view'],
      });
    }
  });

  it('admits the CEO, the Branch Director and the Administrator by default, not the Teacher', () => {
    expect(defaultRolesOf(DafMediaController, 'coverage')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('coverage() DafMediaCoverageService.coverage()ga delegatsiya qiladi', async () => {
    const result = await controller.coverage();
    expect(coverageService.coverage).toHaveBeenCalled();
    expect(result).toEqual({ levels: [] });
  });

  it('overview() eski DafMediaOverviewServiceni ishlatishda davom etadi', () => {
    const result = controller.overview();
    expect(overviewService.overview).toHaveBeenCalled();
    expect(result).toEqual({ vorhanden: false });
  });

  it('inhalt() DafMediaInhaltService.inhalt()ga delegatsiya qiladi', async () => {
    const result = await controller.inhalt(7);
    expect(inhaltService.inhalt).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      woerter: [],
      saetze: [],
      phrasen: [],
      dialogZeilen: [],
    });
  });

  it('jang() DafMediaJangService.jang()ga delegatsiya qiladi', async () => {
    const result = await controller.jang();
    expect(jangService.jang).toHaveBeenCalled();
    expect(result).toEqual({ units: [] });
  });

  it("sinov endpointlari o'quvchisiz (null) chaqiradi", async () => {
    await controller.sinov(100);
    expect(uebungService.seans).toHaveBeenCalledWith(100, null);
    await controller.sinovErsatz(100, {
      itemType: 'WORT',
      itemId: 1,
      nichtFormat: 'WORT_UZ',
    } as any);
    expect(uebungService.ersatz).toHaveBeenCalledWith(
      100,
      null,
      'WORT',
      1,
      'WORT_UZ',
    );
    await controller.sinovCheck({
      itemType: 'WORT',
      itemId: 1,
      format: 'WORT_UZ',
      given: 'a',
    } as any);
    expect(uebungService.pruefen).toHaveBeenCalledWith(
      expect.objectContaining({ given: 'a' }),
      null,
    );
    await controller.sinovJuft({
      itemType: 'WORT',
      itemId: 1,
      format: 'PAAR',
      chap: 'a',
      ong: 'b',
    } as any);
    expect(uebungService.juft).toHaveBeenCalledWith(
      expect.objectContaining({ chap: 'a' }),
      null,
    );
  });

  it('lessonFragen() DafMediaFragenService.lessonFragen()ga delegatsiya qiladi', async () => {
    await controller.lessonFragen(100);
    expect(fragenService.lessonFragen).toHaveBeenCalledWith(100);
  });
});
