"use client";

import { DebtWriteOffsClient } from "../debt-write-offs-client";

/**
 * "Kechirilganlar": debt written off under the "yo'qolgan o'quvchi" flow.
 *
 * The end of the debt story, and the reason it belongs on this page rather
 * than in a menu entry of its own — a figure that vanished from "Jami qarz"
 * without being paid is otherwise unexplained.
 *
 * The list itself is the existing client, unchanged; only its heading moved
 * out, so the page and this tab can each supply the words that fit where the
 * reader actually is.
 */
export function WriteOffsView() {
  return (
    <div className="space-y-4">
      {/* One line. The previous three explained the accounting; a reader who
          opens a tab called "Kechirilganlar" already knows why they are here. */}
      <p className="text-sm text-muted-foreground">
        O&apos;quvchi o&apos;qishni tashlagani uchun undirilmaydigan deb
        belgilangan qarzlar.
      </p>
      <DebtWriteOffsClient />
    </div>
  );
}
