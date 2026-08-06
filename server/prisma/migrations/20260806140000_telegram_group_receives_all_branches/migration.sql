-- An org-wide Telegram group can now say so.
--
-- `TelegramGroup.branchId = NULL` carried two meanings at once: "nobody has
-- assigned this group yet" and "this is the organisation-wide monitoring group".
-- While branch-less groups still received every branch's events the ambiguity
-- was invisible. Closing that leak (a Fargona payment must not appear in a
-- Namangan chat) made the two indistinguishable, and the org-wide groups went
-- silent for operational events with no way to declare that they should not be.
--
-- SAFETY. Structure only: a boolean defaulting to FALSE, which reproduces
-- today's behaviour exactly. Deciding WHICH groups watch every branch is a
-- human call about real chats with real people in them, so it is made by
-- `scripts/set-telegram-group-all-branches.ts` (dry-run first), not guessed here
-- from `branchId IS NULL` — that predicate is precisely the one that cannot tell
-- the two cases apart.

ALTER TABLE "TelegramGroup"
  ADD COLUMN IF NOT EXISTS "receivesAllBranches" BOOLEAN NOT NULL DEFAULT false;
