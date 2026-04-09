# /team-merge — Safe PR Merge + Deploy Command

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

### 6. Analyze changes (for deploy)

Detect which areas changed in the merged PR:

Run:
gh pr diff <PR_NUMBER> --name-only

- If files in `client/` → frontend changed
- If files in `server/` → backend changed
- If both → fullstack

---

### 7. Deploy to production

IF frontend changed:
Deploy client to Vercel (production)

IF backend changed:
Deploy server to Railway (production)

IF both:
Deploy both

---

### 8. Verify deployment

Wait for deployment to complete, then output status:

- Vercel deploy URL + status (if frontend)
- Railway deploy status (if backend)

IF deploy fails:
WARN the user:

⚠️ DEPLOY FAILED

Merge was successful but deployment failed.

1. Check deployment logs
2. Fix the issue
3. Re-deploy manually using /deploy

---

## Output

- "PR #<number> merged successfully"
- "Local main is up to date"
- "Deployed: client ✅ / server ✅" (or whichever was changed)
- Deploy URLs
