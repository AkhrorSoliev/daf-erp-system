import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskDetail } from "@/hooks/use-tasks";
import { useT } from "@/i18n/context";

/**
 * Runs one of the drawer's writes. Every one of them answers with the whole
 * task, which goes to the drawer and the board; a failure is a toast. `busy`
 * keeps a second tap from sending the same write twice.
 */
export function useTaskWrite() {
  const t = useT();
  const applyDetail = useTasks((s) => s.applyDetail);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (request: Promise<{ data: TaskDetail }>, fallback?: string): Promise<boolean> => {
    setBusy(true);
    try {
      applyDetail((await request).data);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, fallback ?? t("Saqlashda xatolik yuz berdi")));
      return false;
    } finally {
      setBusy(false);
    }
  }, [applyDetail, t]);
  return { busy, run };
}
