import {
  NotificationEmpty,
  NotificationFailed,
  NotificationRowView,
  NotificationSkeleton,
} from "./notification-row";
import { groupByDay, groupNotifications, type AppNotification } from "./notification-view";

interface Props {
  /** `undefined` = the list has had no answer yet (loading, or the request failed). */
  items: AppNotification[] | undefined;
  failed: boolean;
  emptyText: string;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
  onRetry: () => void;
}

/**
 * The page's list. A request with no answer is never «nothing here»: it is a
 * skeleton while it runs and a retry when it failed; the empty text appears
 * only after an answer that really was empty.
 */
export function NotificationPageList({ items, failed, emptyText, now, onOpen, hrefOf, onRetry }: Props) {
  if (!items) return failed ? <NotificationFailed onRetry={onRetry} /> : <NotificationSkeleton />;
  if (items.length === 0) return <NotificationEmpty text={emptyText} />;
  return (
    <>
      {groupByDay(items, now).map((day) => (
        <div key={day.label}>
          <p className="border-b bg-muted/30 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{day.label}</p>
          <div className="divide-y">
            {groupNotifications(day.items).map((row) => (
              <NotificationRowView key={row.key} row={row} now={now} onOpen={onOpen} hrefOf={hrefOf} collapsible />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
