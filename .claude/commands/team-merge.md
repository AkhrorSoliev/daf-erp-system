# /team-merge — Safe PR Merge Command

## Usage

/team-merge <PR_NUMBER>

---

## Steps

### 1. Validate input

Ensure PR number is provided

---

### 2. Check PR status

Run:
gh pr view <PR_NUMBER>

---

### 3. Check mergeability

Run:
gh pr view <PR_NUMBER> --json mergeable

IF NOT mergeable:
STOP and output:

⚠️ PR HAS CONFLICTS

To fix:

1. git fetch origin main
2. git checkout <branch>
3. git rebase origin/main
4. Resolve conflicts
5. git push --force

---

### 4. Merge PR

Run:
gh pr merge <PR_NUMBER> --merge --delete-branch

---

### 5. Sync local main

Run:
git checkout main
git pull --rebase origin main

---

## Output

- "PR #<number> merged successfully"
- "Local main is up to date"
