import type { UiSkinId } from "@/lib/ui-skins";

export interface ChangeUiSkinDeps {
  /** The skin the page holds now. */
  current(): string | null | undefined;
  /** Put a skin into the page's state (the user store); null clears it. */
  apply(skin: string | null): void;
  /** Persist it on the account. */
  save(skin: UiSkinId): Promise<void>;
  /** Tell the user the save failed. */
  fail(error: unknown): void;
}

/** Counts the changes; only the newest one may touch the page when its save settles. */
let latest = 0;

/**
 * Optimistic skin change: the page switches at once, the account is written
 * after. When a save settles only the newest change acts: on success it applies
 * its skin again (a session refresh during the save overwrites the store with
 * the server's older user, and would otherwise undo it); on failure it puts the
 * old skin back. An older change never touches the page, so a slow failure
 * cannot undo the latest choice. The user is told about every failed save.
 */
export async function changeUiSkin(next: UiSkinId, deps: ChangeUiSkinDeps): Promise<boolean> {
  const seq = ++latest;
  const previous = deps.current() ?? null;
  deps.apply(next);
  try {
    await deps.save(next);
    if (seq === latest) deps.apply(next);
    return true;
  } catch (error) {
    if (seq === latest) deps.apply(previous);
    deps.fail(error);
    return false;
  }
}
