import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);
  private clients = new Map<number, Set<Response>>();
  private heartbeatIntervals = new Map<Response, NodeJS.Timeout>();

  addClient(userId: number, res: Response) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(res);

    // Heartbeat every 30s to keep connection alive
    const interval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        this.removeClient(userId, res);
      }
    }, 30_000);
    this.heartbeatIntervals.set(res, interval);

    this.logger.debug(`SSE client connected: userId=${userId}`);
  }

  removeClient(userId: number, res: Response) {
    const interval = this.heartbeatIntervals.get(res);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(res);
    }

    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }

    this.logger.debug(`SSE client disconnected: userId=${userId}`);
  }

  sendToUser(userId: number, data: any) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) return;

    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of userClients) {
      try {
        res.write(message);
      } catch {
        this.removeClient(userId, res);
      }
    }
  }

  getConnectedUserIds(): number[] {
    return Array.from(this.clients.keys());
  }
}
