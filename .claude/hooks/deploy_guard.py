#!/usr/bin/env python3
"""Deploy guard: a production deploy must contain everything `origin/main` has.

Neither Railway nor Vercel is connected to GitHub here: `railway up` and
`vercel --prod` ship whatever tree the command runs in. A deploy cut from a
branch that never merged the latest `main` therefore silently REMOVES merged
work from production (2026-10-26: a chat branch deployed at 23:34 and the whole
tax feature, merged at 10:13, disappeared from the live site).

Two ways to run it:

* `python3 .claude/hooks/deploy_guard.py --check [DIR]` — prints the verdict and
  exits 1 when DIR's HEAD is missing commits that are on origin/main.
* As a Claude Code PreToolUse hook (JSON on stdin): when the Bash command is a
  production deploy, it answers `deny` with the reason. Anything else, and any
  doubt (no git, no origin/main, unreadable input), answers nothing and exits 0:
  an advisory hook must never block ordinary work.

`DEPLOY_ALLOW_BEHIND_MAIN=1` lets a deliberate hotfix through; the missing
commits are still listed so the person knows what the deploy will remove.
"""
import json
import os
import re
import subprocess
import sys

DEPLOY_RE = re.compile(
    r"(?<![\w-])railway\s+up(?![\w-])|(?<![\w-])vercel\b[^\n;&|]*--prod(?![\w-])|(?<![\w-])vercel\s+deploy(?![\w-])"
)
CD_RE = re.compile(r"(?<![\w-])cd\s+(\"[^\"]+\"|'[^']+'|[^\s;&|]+)")
MAX_LISTED = 12


def git(directory, *args):
    return subprocess.run(
        ["git", "-C", directory, *args],
        capture_output=True,
        text=True,
        timeout=60,
    )


def check(directory):
    """Return None when safe (or unknown), else a list [lines] explaining why not."""
    if git(directory, "rev-parse", "--is-inside-work-tree").returncode != 0:
        return None
    git(directory, "fetch", "--quiet", "origin", "main")  # offline: use the local ref
    if git(directory, "rev-parse", "--verify", "--quiet", "origin/main").returncode != 0:
        return None
    if git(directory, "merge-base", "--is-ancestor", "origin/main", "HEAD").returncode == 0:
        return None
    missing = git(directory, "log", "--oneline", "HEAD..origin/main").stdout.strip().splitlines()
    head = git(directory, "rev-parse", "--short", "HEAD").stdout.strip()
    lines = [
        f"HEAD ({head}) does not contain {len(missing)} commit(s) that are on origin/main.",
        "A deploy from here would REMOVE them from production.",
        "Newest missing:",
    ]
    lines += [f"  {m}" for m in missing[:MAX_LISTED]]
    if len(missing) > MAX_LISTED:
        lines.append(f"  ... and {len(missing) - MAX_LISTED} more")
    lines.append("Fix: merge or rebase origin/main into this branch (or deploy from origin/main), then retry.")
    lines.append("Deliberate hotfix: set DEPLOY_ALLOW_BEHIND_MAIN=1.")
    return lines


def target_dir(command, cwd):
    """The directory the deploy will run in: the first `cd X` in the command, else cwd."""
    m = CD_RE.search(command)
    if not m:
        return cwd
    path = os.path.expanduser(m.group(1).strip("\"'"))
    return path if os.path.isabs(path) else os.path.join(cwd, path)


def hook(payload):
    if payload.get("tool_name") != "Bash":
        return None
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not DEPLOY_RE.search(command):
        return None
    if os.environ.get("DEPLOY_ALLOW_BEHIND_MAIN") == "1" or re.search(
        r"(?<![\w-])DEPLOY_ALLOW_BEHIND_MAIN=1", command
    ):
        return None
    problem = check(target_dir(command, payload.get("cwd") or os.getcwd()))
    if not problem:
        return None
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "Deploy guard: " + " ".join(problem),
        }
    }


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        problem = check(sys.argv[2] if len(sys.argv) > 2 else os.getcwd())
        if problem:
            print("\n".join(problem))
            return 1
        print("deploy guard: ok (HEAD contains origin/main)")
        return 0
    try:
        answer = hook(json.load(sys.stdin))
    except Exception:
        return 0
    if answer:
        print(json.dumps(answer))
    return 0


if __name__ == "__main__":
    sys.exit(main())
