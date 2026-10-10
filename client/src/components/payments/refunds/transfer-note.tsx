import { CircleCheck, Lock } from "lucide-react";
import { transferLine } from "./refunds-format";
import type { TransferState } from "./refunds-types";

/** «Markaz hisobiga o'tkazish» condition (spec §5.2), in the drawer and in «Yechib olish» alike. */
export function TransferNote({ transfer }: { transfer: TransferState }) {
  const { allowed, text } = transferLine(transfer);
  if (!text) return null;
  if (allowed) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0" />{text}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <Lock className="mt-0.5 size-3.5 shrink-0" />{text}
    </p>
  );
}
