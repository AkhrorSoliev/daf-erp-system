import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadOwnershipService } from './lead-ownership.service';

/**
 * Every 15 minutes in working time (08:00–18:45, Monday–Saturday, Tashkent).
 * A deadline always falls inside working time, so nothing expires at night.
 */
@Injectable()
export class LeadOwnershipCron {
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(private ownership: LeadOwnershipService) {}

  @Cron('0 */15 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ownership.expireOverdue(new Date());
    } finally {
      this.running = false;
    }
  }
}
