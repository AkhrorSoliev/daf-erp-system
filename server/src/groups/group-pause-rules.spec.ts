import { BadRequestException } from '@nestjs/common';
import { GroupStatus } from '@prisma/client';
import { decidePauseChange } from './group-pause-rules';

const TODAY = '2026-10-23';
const pause = (extra: object) => ({ status: GroupStatus.PAUSED, ...extra });
const resume = (extra: object) => ({ status: GroupStatus.ACTIVE, ...extra });

describe('decidePauseChange', () => {
  it('a pause needs the planned day or an explicit unknown', () => {
    expect(() =>
      decidePauseChange(GroupStatus.ACTIVE, pause({}), TODAY),
    ).toThrow(BadRequestException);
    expect(() =>
      decidePauseChange(
        GroupStatus.ACTIVE,
        pause({ plannedResumeOn: '2026-11-05', resumeUnknown: true }),
        TODAY,
      ),
    ).toThrow(BadRequestException);
  });

  it('a pause with a planned day keeps it', () => {
    expect(
      decidePauseChange(
        GroupStatus.ACTIVE,
        pause({ plannedResumeOn: '2026-11-05' }),
        TODAY,
      ),
    ).toEqual({ kind: 'pause', plannedResumeOn: '2026-11-05' });
  });

  it('an unknown restart day is stored as null', () => {
    expect(
      decidePauseChange(
        GroupStatus.ACTIVE,
        pause({ resumeUnknown: true }),
        TODAY,
      ),
    ).toEqual({ kind: 'pause', plannedResumeOn: null });
  });

  it('the planned day must be after today and a real calendar day', () => {
    expect(() =>
      decidePauseChange(
        GroupStatus.ACTIVE,
        pause({ plannedResumeOn: TODAY }),
        TODAY,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      decidePauseChange(
        GroupStatus.ACTIVE,
        pause({ plannedResumeOn: '2026-02-31' }),
        TODAY,
      ),
    ).toThrow(BadRequestException);
  });

  it('a resume needs the day lessons restart', () => {
    expect(() =>
      decidePauseChange(GroupStatus.PAUSED, resume({}), TODAY),
    ).toThrow(BadRequestException);
  });

  it('a resume today opens the group now, a later day schedules it', () => {
    expect(
      decidePauseChange(GroupStatus.PAUSED, resume({ resumeOn: TODAY }), TODAY),
    ).toEqual({ kind: 'resume-now', resumeOn: TODAY });
    expect(
      decidePauseChange(
        GroupStatus.PAUSED,
        resume({ resumeOn: '2026-11-05' }),
        TODAY,
      ),
    ).toEqual({ kind: 'resume-later', resumeOn: '2026-11-05' });
  });

  it('a resume cannot name a day that has passed', () => {
    expect(() =>
      decidePauseChange(
        GroupStatus.PAUSED,
        resume({ resumeOn: '2026-10-20' }),
        TODAY,
      ),
    ).toThrow(BadRequestException);
  });

  it('other changes ignore the pause fields', () => {
    expect(
      decidePauseChange(
        GroupStatus.PAUSED,
        { status: GroupStatus.CANCELLED },
        TODAY,
      ),
    ).toEqual({ kind: 'other' });
    expect(
      decidePauseChange(
        GroupStatus.FORMING,
        { status: GroupStatus.ACTIVE },
        TODAY,
      ),
    ).toEqual({ kind: 'other' });
  });
});
