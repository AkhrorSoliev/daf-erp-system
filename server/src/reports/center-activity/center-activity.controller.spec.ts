import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { CenterActivityController } from './center-activity.controller';
import { CenterActivityService } from './center-activity.service';

describe('CenterActivityController', () => {
  const service = {
    overview: jest.fn().mockResolvedValue({}),
    excel: jest.fn().mockResolvedValue({
      buffer: Buffer.from('xlsx'),
      filename: 'markaz-faoliyati-2026-09.xlsx',
    }),
  };
  let controller: CenterActivityController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CenterActivityController],
      providers: [{ provide: CenterActivityService, useValue: service }],
    }).compile();
    controller = module.get(CenterActivityController);
  });

  it.each(['overview', 'excel'])(
    '%s is gated by reports.students and admits CEO and Branch Director only',
    (method) => {
      expect(routeAccess(CenterActivityController, method)).toEqual({
        kind: 'can',
        keys: ['reports.students'],
      });
      expect(defaultRolesOf(CenterActivityController, method)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = { oy: '2026-09', filial: 2 };
    await controller.overview(q, 1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('excel sends the workbook as an attachment with the three headers', async () => {
    const q = { oy: '2026-09' };
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel(q, 1001, [4], res as never);
    expect(service.excel).toHaveBeenCalledWith(1001, [4], q);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="markaz-faoliyati-2026-09.xlsx"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 4);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
});
