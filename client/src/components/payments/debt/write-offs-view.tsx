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
      <p className="max-w-2xl text-sm text-muted-foreground">
        Undirib bo&apos;lmagani uchun hisobdan chiqarilgan qarzlar. Bu pul
        qaytmaydi — shuning uchun u &laquo;Jami qarz&raquo;dan chiqib ketgan,
        lekin yo&apos;qolib qolmagan: sababi va kim qilgani shu yerda qoladi.
      </p>
      <DebtWriteOffsClient />
    </div>
  );
}
