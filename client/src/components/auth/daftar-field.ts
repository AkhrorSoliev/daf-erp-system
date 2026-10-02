// The underline-only field of the staff sign-in theme (Daftar): the value is
// written on a line of the sheet. The row carries the line, so a prefix or a
// reveal button sits on the same line as the input. 16px text keeps iOS from
// zooming the page when a field takes focus.
export const DAFTAR_ROW =
  "flex items-center gap-2 border-b-[1.5px] border-input transition-colors focus-within:border-primary focus-within:shadow-[0_1.5px_0_0_var(--primary)]";

export const DAFTAR_INPUT =
  "h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground";
