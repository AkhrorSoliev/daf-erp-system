/**
 * Command line shared by the one-off scripts that are a dry run unless
 * `--apply --expect=<N>` is given. Pure, so the rules that stop a mistyped
 * production run are tested.
 */

/** A refused command line: reported as a plain message, nothing is connected or written. */
export class UsageError extends Error {}

export function parseApplyExpectArgs(
  argv: string[],
  usage: string,
): { apply: boolean; expect: number | null } {
  let apply = false;
  let expect: number | null = null;
  const seen = new Set<string>();

  for (const arg of argv) {
    // Only these two exact shapes; `--apply=1`, `--expect 3` and anything else is refused.
    const name =
      arg === '--apply'
        ? 'apply'
        : arg.startsWith('--expect=')
          ? 'expect'
          : null;
    if (!name) throw new UsageError(`Unknown argument "${arg}". ${usage}`);
    if (seen.has(name)) throw new UsageError(`--${name} given twice. ${usage}`);
    seen.add(name);

    if (name === 'apply') {
      apply = true;
    } else {
      const raw = arg.slice('--expect='.length);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new UsageError(`--expect must be a whole number, got "${raw}".`);
      }
      expect = Number(raw);
    }
  }

  if (apply && expect === null) {
    throw new UsageError(
      `--apply requires --expect=<N>: run the dry run first and pass the count it printed. ${usage}`,
    );
  }
  return { apply, expect };
}
