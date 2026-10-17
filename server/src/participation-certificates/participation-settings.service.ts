import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.types';
import {
  APP_LEVELS,
  isAppLevel,
  type AppLevel,
  type Thresholds,
} from './participation-rules';

export interface ParticipationSettings {
  minAttendancePercent: number;
  minAppPercent: Record<AppLevel, number>;
}

export interface ParticipationSettingsPatch {
  minAttendancePercent?: number;
  minAppPercent?: Partial<Record<AppLevel, number>>;
}

/** The CEO's thresholds for the Teilnahmebestätigung, company-level (spec 3.3). */
@Injectable()
export class ParticipationSettingsService {
  constructor(private settings: SettingsService) {}

  async read(companyId: number): Promise<ParticipationSettings> {
    const [attendance, a1, a2, b1] = await Promise.all([
      this.settings.get(companyId, 'participation.minAttendancePercent'),
      this.settings.get(companyId, 'participation.minAppPercent.A1'),
      this.settings.get(companyId, 'participation.minAppPercent.A2'),
      this.settings.get(companyId, 'participation.minAppPercent.B1'),
    ]);
    return {
      minAttendancePercent: attendance,
      minAppPercent: { A1: a1, A2: a2, B1: b1 },
    };
  }

  async update(
    companyId: number,
    patch: ParticipationSettingsPatch,
    userId: number,
  ): Promise<ParticipationSettings> {
    const entries: [SettingKey, unknown][] = [];
    if (patch.minAttendancePercent !== undefined) {
      entries.push([
        'participation.minAttendancePercent',
        patch.minAttendancePercent,
      ]);
    }
    for (const level of APP_LEVELS) {
      const value = patch.minAppPercent?.[level];
      if (value !== undefined) {
        entries.push([`participation.minAppPercent.${level}`, value]);
      }
    }
    if (entries.length === 0) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    // One transaction: the numbers are never seen half-saved.
    await this.settings.setMany(companyId, entries, userId);
    return this.read(companyId);
  }

  thresholdsFor(settings: ParticipationSettings, level: string): Thresholds {
    return {
      attendance: settings.minAttendancePercent,
      app: isAppLevel(level) ? settings.minAppPercent[level] : null,
    };
  }
}
