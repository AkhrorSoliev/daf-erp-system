import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.types';

export interface ChatSettings {
  enabled: boolean;
  weekMinutesActive: number;
  weekMinutesRadio: number;
}

const KEYS = {
  enabled: 'chat.enabled',
  weekMinutesActive: 'chat.weekMinutesActive',
  weekMinutesRadio: 'chat.weekMinutesRadio',
} as const satisfies Record<keyof ChatSettings, SettingKey>;

/** The CEO's student-chat switch and weekly minutes, company-level. */
@Injectable()
export class ChatAdminSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async read(companyId: number): Promise<ChatSettings> {
    const [enabled, weekMinutesActive, weekMinutesRadio] = await Promise.all([
      this.settings.get(companyId, KEYS.enabled),
      this.settings.get(companyId, KEYS.weekMinutesActive),
      this.settings.get(companyId, KEYS.weekMinutesRadio),
    ]);
    return { enabled, weekMinutesActive, weekMinutesRadio };
  }

  async update(
    companyId: number,
    patch: Partial<ChatSettings>,
    userId: number,
  ): Promise<ChatSettings> {
    const entries: [SettingKey, unknown][] = [];
    for (const field of Object.keys(KEYS) as (keyof ChatSettings)[]) {
      if (patch[field] !== undefined) entries.push([KEYS[field], patch[field]]);
    }
    if (entries.length === 0) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    // One transaction: the values are never seen half-saved.
    await this.settings.setMany(companyId, entries, userId);
    return this.read(companyId);
  }
}
