import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskDetail } from "@/hooks/use-tasks";

/**
 * Runs one of the drawer's writes. Every one of them answers with the whole
 * task, which goes to the drawer and the board; a failure is a toast. `busy`
 * keeps a second tap from sending the same write twice.
 */
export function useTaskWrite() {
  const applyDetail = useTasks((s) => s.applyDetail);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (request: Promise<{ data: TaskDetail }>, fallback = "Saqlashda xatolik yuz berdi"): Promise<boolean> => {
    setBusy(true);
    try {
      applyDetail((await request).data);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }, [applyDetail]);
  return { busy, run };
}
