import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityHeartbeatDto } from './activity-heartbeat.dto';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
const toliq = {
  sessionId: UUID,
  platform: 'WEB',
  activeSeconds: 120,
  radioSeconds: 30,
  sections: { LERNEN: 80, OTHER: 40 },
};

async function xatolar(body: object) {
  const dto = plainToInstance(ActivityHeartbeatDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((x) => x.property);
}

describe('ActivityHeartbeatDto', () => {
  it('to`liq so`rov o`tadi; appVersion ixtiyoriy', async () => {
    expect(await xatolar(toliq)).toEqual([]);
    expect(await xatolar({ ...toliq, appVersion: '1.2.0' })).toEqual([]);
    expect(await xatolar({ ...toliq, sections: {} })).toEqual([]);
  });

  it('noto`g`ri uuid, platforma, manfiy va sutkadan katta qiymat rad etiladi', async () => {
    const r = await xatolar({
      ...toliq,
      sessionId: 'seans-1',
      platform: 'DESKTOP',
      activeSeconds: -1,
      radioSeconds: 86_401,
    });
    expect(r.sort()).toEqual([
      'activeSeconds',
      'platform',
      'radioSeconds',
      'sessionId',
    ]);
  });

  it('sections ichida noma`lum kalit yoki manfiy qiymat rad etiladi', async () => {
    expect(await xatolar({ ...toliq, sections: { RADIO: 5 } })).toEqual([
      'sections',
    ]);
    expect(await xatolar({ ...toliq, sections: { LERNEN: -2 } })).toEqual([
      'sections',
    ]);
  });

  it('studentId maydoni qabul qilinmaydi', async () => {
    expect(await xatolar({ ...toliq, studentId: 5 })).toEqual(['studentId']);
  });
});
