// The ring sits inside the row: a box-shadow on a table row is painted over by its neighbours otherwise.
const ROW_CLASS = "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Props that make a table row act as a button: click, Enter and Space, reachable by Tab, with a focus ring. */
export function rowAsButton(act: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    className: ROW_CLASS,
    onClick: act,
    onKeyDown: (e: { key: string; target: unknown; currentTarget: unknown; preventDefault: () => void }) => {
      // Only the row itself: Enter or Space inside something nested in it belongs to that thing.
      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); act(); }
    },
  };
}
