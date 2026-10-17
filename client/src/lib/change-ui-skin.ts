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

/**
 * Optimistic skin change: the page switches at once, the account is written
 * after. A failed save puts the old skin back — but only if nothing newer was
 * chosen meanwhile, so a slow failure never undoes the latest choice.
 */
export async function changeUiSkin(next: UiSkinId, deps: ChangeUiSkinDeps): Promise<boolean> {
  const previous = deps.current() ?? null;
  deps.apply(next);
  try {
    await deps.save(next);
    return true;
  } catch (error) {
    if (deps.current() === next) deps.apply(previous);
    deps.fail(error);
    return false;
  }
}
