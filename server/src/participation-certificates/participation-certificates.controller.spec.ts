import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { IpThrottlerGuard } from '../common/guards';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ParticipationCertificatesController } from './participation-certificates.controller';

describe('ParticipationCertificatesController', () => {
  it('the PDF is gated by students.details', () => {
    expect(routeAccess(ParticipationCertificatesController, 'pdf')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
    expect(defaultRolesOf(ParticipationCertificatesController, 'pdf')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('cancelling is gated by students.manage, like issuing: CEO, Branch Director, Administrator', () => {
    expect(routeAccess(ParticipationCertificatesController, 'revoke')).toEqual({
      kind: 'can',
      keys: ['students.manage'],
    });
    expect(
      defaultRolesOf(ParticipationCertificatesController, 'revoke'),
    ).toEqual(['Administrator', 'Branch Director', 'CEO']);
  });

  it('cancelling passes the caller, the company, the id and the reason to the service', async () => {
    const view = { id: 'c1', revoked: true };
    const service = { revoke: jest.fn().mockResolvedValue(view) };
    const controller = new ParticipationCertificatesController(
      service as never,
      { read: jest.fn(), update: jest.fn() } as never,
    );
    await expect(
      controller.revoke('c1', { reason: 'Xato berilgan' }, 7, 1001),
    ).resolves.toBe(view);
    expect(service.revoke).toHaveBeenCalledWith(7, 1001, 'c1', 'Xato berilgan');
  });

  it('the QR page is public', () => {
    expect(routeAccess(ParticipationCertificatesController, 'verify')).toEqual({
      kind: 'public',
    });
  });

  it('the QR page is rate-limited per IP: IpThrottlerGuard, 60 requests a minute', () => {
    const verify = (
      ParticipationCertificatesController.prototype as unknown as Record<
        string,
        object
      >
    ).verify;
    const guards =
      (Reflect.getMetadata('__guards__', verify) as unknown[]) ?? [];
    expect(guards).toContain(IpThrottlerGuard);
    // `@Throttle({ default: ... })` stores the numbers under `<key>default`.
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, verify)).toBe(60);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, verify)).toBe(60_000);
  });

  it.each(['getSettings', 'setSettings'])('%s is the CEO alone', (method) => {
    expect(routeAccess(ParticipationCertificatesController, method)).toEqual({
      kind: 'ceo',
    });
  });

  it('serves the PDF with its filename', async () => {
    const service = {
      pdf: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF'),
        filename: 'TB-2026-0001.pdf',
      }),
    };
    const settings = { read: jest.fn(), update: jest.fn() };
    const controller = new ParticipationCertificatesController(
      service as never,
      settings as never,
    );
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.pdf('c1', 7, 1001, res as never);
    expect(service.pdf).toHaveBeenCalledWith(7, 1001, 'c1');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="TB-2026-0001.pdf"',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('reads and writes the thresholds for the caller’s company', async () => {
    const service = { pdf: jest.fn(), verify: jest.fn() };
    const settings = {
      read: jest.fn().mockResolvedValue({ minAttendancePercent: 80 }),
      update: jest.fn().mockResolvedValue({ minAttendancePercent: 70 }),
    };
    const controller = new ParticipationCertificatesController(
      service as never,
      settings as never,
    );
    await controller.getSettings(1001);
    expect(settings.read).toHaveBeenCalledWith(1001);
    await controller.setSettings({ minAttendancePercent: 70 }, 1001, 7);
    expect(settings.update).toHaveBeenCalledWith(
      1001,
      { minAttendancePercent: 70 },
      7,
    );
  });
});
