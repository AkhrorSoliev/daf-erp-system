export interface WriteOffUndoState {
  reversedAt: string | null;
  reversedTransactionId?: string | null;
}

/**
 * Only the CEO, and only on an original write-off still in effect. An undo row
 * (reversedTransactionId set) is the correction itself; undoing it would
 * forgive the debt again. The server refuses both cases too.
 */
export function canUndoWriteOff(isCeo: boolean, row: WriteOffUndoState): boolean {
  return isCeo && !row.reversedAt && !row.reversedTransactionId;
}
