import { Injectable } from '@nestjs/common';

/** Placeholder so the DI token resolves; Task 8 replaces it with the real outbox. */
@Injectable()
export class TaskOutboxService {
  async schedule(_db: unknown, _task: { id: string }): Promise<void> {}
}
