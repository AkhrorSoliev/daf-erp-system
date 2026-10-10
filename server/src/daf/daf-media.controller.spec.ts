import { Test, TestingModule } from '@nestjs/testing';
import { DafMediaController } from './daf-media.controller';
import { DafMediaOverviewService } from './media/daf-media-overview.service';
import { DafMediaCoverageService } from './media/daf-media-coverage.service';
import { DafMediaInhaltService } from './media/daf-media-inhalt.service';
import { DafMediaFragenService } from './media/daf-media-fragen.service';
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
    fragen: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DafMediaController],
      providers: [
        { provide: DafMediaOverviewService, useValue: overviewService },
        { provide: DafMediaCoverageService, useValue: coverageService },
        { provide: DafMediaInhaltService, useValue: inhaltService },
        { provide: DafMediaFragenService, useValue: fragenService },
      ],
    }).compile();

    controller = module.get(DafMediaController);
  });

  it('every route is gated by the media view capability', () => {
    for (const method of ['coverage', 'overview', 'fragen', 'inhalt']) {
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

  it('fragen() DafMediaFragenService.fragen()ga delegatsiya qiladi', async () => {
    const result = await controller.fragen(7);
    expect(fragenService.fragen).toHaveBeenCalledWith(7);
    expect(result).toEqual([]);
  });
});
