export interface WriteOffUndoState {
  reversedAt: string | null;
  reversedTransactionId?: string | null;
}

/**
 * Only a user who may undo money (`money.undo`), and only on an original
 * write-off still in effect. An undo row (reversedTransactionId set) is the
 * correction itself; undoing it would forgive the debt again. The server
 * refuses both cases too.
 */
export function canUndoWriteOff(canUndo: boolean, row: WriteOffUndoState): boolean {
  return canUndo && !row.reversedAt && !row.reversedTransactionId;
}
