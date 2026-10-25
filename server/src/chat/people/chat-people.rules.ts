import type { ChatFindWho, ChatWho } from '@prisma/client';

export function mayWrite(who: ChatWho, sharesGroup: boolean): boolean {
  if (who === 'EVERYONE') return true;
  if (who === 'GROUPMATES') return sharesGroup;
  return false;
}

export const maySeePhoto = mayWrite;

/** An exact `@username` is never subject to this: only the name search is. */
export function mayFindByName(who: ChatFindWho): boolean {
  return who === 'EVERYONE';
}
