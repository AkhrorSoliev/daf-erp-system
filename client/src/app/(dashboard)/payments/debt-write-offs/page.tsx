import { DebtSubpage } from "@/components/payments/debt/debt-subpage";
import { WriteOffsView } from "@/components/payments/debt/write-offs-view";

// A real page again (spec B2a §2.6). No Suspense: the view keeps no URL state.
export default function DebtWriteOffsPage() {
  return (
    <DebtSubpage title="Kechirilgan qarzlar arxivi">
      <WriteOffsView />
    </DebtSubpage>
  );
}
