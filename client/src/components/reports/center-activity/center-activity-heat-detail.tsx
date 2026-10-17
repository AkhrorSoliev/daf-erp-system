import { HEAT_HINT, HEAT_NO_FREE, type HeatDetail } from "./center-activity-format";

/** Under the matrix: the free rooms of the clicked hour, then the busy ones with the groups that hold them. */
export function CenterActivityHeatDetail({ detail }: { detail: HeatDetail | null }) {
  if (!detail) {
    return <p className="text-sm text-muted-foreground">{HEAT_HINT}</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" aria-live="polite">
      <h4 className="text-sm font-medium">{detail.title}</h4>
      {detail.free.length === 0 ? (
        <p className="text-sm text-muted-foreground">{HEAT_NO_FREE}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {detail.free.map((r) => (
            <li key={r.id} className="rounded-md bg-muted px-2 py-1 text-sm">{r.text}</li>
          ))}
        </ul>
      )}
      {detail.busy.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {detail.busy.map((r) => (
            <li key={r.id} className="rounded-md border px-2 py-1">
              <s>{r.name}</s>
              {r.groups && <> — {r.groups}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
