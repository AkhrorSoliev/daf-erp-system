import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DafMediaController } from './daf-media.controller';
import { DafMediaOverviewService } from './media/daf-media-overview.service';
import { DafMediaCoverageService } from './media/daf-media-coverage.service';
import { DafMediaInhaltService } from './media/daf-media-inhalt.service';
import { DafMediaFragenService } from './media/daf-media-fragen.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

/**
 * Roldan tashqari, `coverage()` haqiqatan ham yangi xizmatga delegatsiya
 * qilishini ham tekshiradi — aks holda ikkala endpoint bir xil eski
 * manifestni qaytarib qolishi mumkin edi.
 */
describe('DafMediaController — role guard', () => {
  let controller: DafMediaController;
  let reflector: Reflector;
  let guard: RolesGuard;

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
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(roles: string[]) {
    return {
      getHandler: () => controller.coverage,
      getClass: () => DafMediaController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('sinf darajasida CEO / Branch Director / Administrator metadatasi bor', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, DafMediaController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

  it('CEO uchun ruxsat beradi', () => {
    expect(guard.canActivate(mockExecutionContext(['CEO']))).toBe(true);
  });

  it('Teacher uchun rad etadi', () => {
    expect(() => guard.canActivate(mockExecutionContext(['Teacher']))).toThrow(
      "Sizga bu amalni bajarishga ruxsat yo'q",
    );
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
